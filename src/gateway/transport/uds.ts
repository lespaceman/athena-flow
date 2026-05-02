import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {encodeLine, LineReader, LineReaderOverflowError} from './framing';
import {traceGatewayFrame} from './trace';
import {
	TransportUnreachableError,
	type ClientTransport,
	type FramedConnection,
	type ServerTransport,
} from './types';

export type UdsServerTransportOptions = {
	socketPath: string;
	logError?: (message: string) => void;
};

export type UdsClientTransportOptions = {
	socketPath: string;
	timeoutMs?: number;
};

export function createUdsServerTransport(
	opts: UdsServerTransportOptions,
): ServerTransport {
	return {
		kind: 'uds',
		listen: onConnection => listenUds(opts, onConnection),
	};
}

export function createUdsClientTransport(
	opts: UdsClientTransportOptions,
): ClientTransport {
	return {
		kind: 'uds',
		connect: () => connectUds(opts),
	};
}

async function listenUds(
	opts: UdsServerTransportOptions,
	onConnection: (connection: FramedConnection) => void,
): Promise<{close: () => Promise<void>}> {
	const logError =
		opts.logError ?? ((m: string) => process.stderr.write(m + '\n'));

	await unlinkIfStale(opts.socketPath);
	fs.mkdirSync(path.dirname(opts.socketPath), {recursive: true, mode: 0o700});

	const activeSockets = new Set<net.Socket>();
	const server = net.createServer({pauseOnConnect: false}, socket => {
		activeSockets.add(socket);
		socket.once('close', () => activeSockets.delete(socket));
		onConnection(createSocketConnection(socket, 'uds', logError));
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (err: Error) => reject(err);
		server.once('error', onError);
		server.listen(opts.socketPath, () => {
			server.off('error', onError);
			try {
				if (process.platform !== 'win32') {
					fs.chmodSync(opts.socketPath, 0o600);
				}
			} catch (err) {
				logError(
					`gateway: chmod 0600 on socket failed: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
			}
			resolve();
		});
	});

	return {
		close: () =>
			new Promise<void>(resolve => {
				for (const socket of activeSockets) {
					socket.destroy();
				}
				activeSockets.clear();
				server.close(() => {
					try {
						fs.unlinkSync(opts.socketPath);
					} catch {
						// best-effort
					}
					resolve();
				});
			}),
	};
}

async function connectUds(
	opts: UdsClientTransportOptions,
): Promise<FramedConnection> {
	const timeoutMs = opts.timeoutMs ?? 5_000;
	const socket = net.createConnection({path: opts.socketPath});

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.destroy();
			reject(
				new TransportUnreachableError(`connect timed out after ${timeoutMs}ms`),
			);
		}, timeoutMs);
		socket.once('connect', () => {
			clearTimeout(timer);
			resolve();
		});
		socket.once('error', err => {
			clearTimeout(timer);
			const code = (err as NodeJS.ErrnoException).code;
			if (code === 'ENOENT' || code === 'ECONNREFUSED') {
				reject(
					new TransportUnreachableError(
						`gateway not reachable at ${opts.socketPath}: ${err.message}`,
					),
				);
			} else {
				reject(err);
			}
		});
	});

	return createSocketConnection(socket, 'uds');
}

async function unlinkIfStale(socketPath: string): Promise<void> {
	if (!fs.existsSync(socketPath)) return;
	const alive = await new Promise<boolean>(resolve => {
		const probe = net.connect(socketPath);
		const timer = setTimeout(() => {
			probe.destroy();
			resolve(false);
		}, 250);
		probe.once('connect', () => {
			clearTimeout(timer);
			probe.end();
			resolve(true);
		});
		probe.once('error', () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
	if (!alive) {
		try {
			fs.unlinkSync(socketPath);
		} catch {
			// best-effort
		}
	}
}

function createSocketConnection(
	socket: net.Socket,
	peer: string,
	logError?: (message: string) => void,
): FramedConnection {
	const reader = new LineReader();
	const frameHandlers = new Set<(frame: unknown) => void>();
	const closeHandlers = new Set<() => void>();
	const errorHandlers = new Set<(err: Error) => void>();

	socket.on('data', chunk => {
		let lines: string[];
		try {
			lines = reader.push(chunk);
		} catch (err) {
			if (err instanceof LineReaderOverflowError) {
				logError?.(`gateway: control connection overflow — closing`);
				socket.destroy();
				return;
			}
			throw err;
		}
		for (const line of lines) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				socket.destroy();
				return;
			}
			traceGatewayFrame('uds', peer, 'in', parsed);
			for (const handler of frameHandlers) handler(parsed);
		}
	});

	socket.on('error', err => {
		for (const handler of errorHandlers) handler(err);
	});

	socket.on('close', () => {
		for (const handler of closeHandlers) handler();
	});

	return {
		kind: 'uds',
		peer,
		send: frame => {
			if (!socket.writable) return;
			traceGatewayFrame('uds', peer, 'out', frame);
			socket.write(encodeLine(frame));
		},
		close: () => socket.destroy(),
		onFrame: cb => {
			frameHandlers.add(cb);
			return () => frameHandlers.delete(cb);
		},
		onClose: cb => {
			closeHandlers.add(cb);
			return () => closeHandlers.delete(cb);
		},
		onError: cb => {
			errorHandlers.add(cb);
			return () => errorHandlers.delete(cb);
		},
	};
}
