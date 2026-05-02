export type TransportKind = 'uds' | 'ws';

export class TransportUnreachableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TransportUnreachableError';
	}
}

export type FramedConnection = {
	readonly kind: TransportKind;
	readonly peer: string;
	send: (frame: unknown) => void;
	close: () => void;
	onFrame: (cb: (frame: unknown) => void) => () => void;
	onClose: (cb: () => void) => () => void;
	onError: (cb: (err: Error) => void) => () => void;
};

export type ServerTransport = {
	readonly kind: TransportKind;
	listen: (onConnection: (connection: FramedConnection) => void) => Promise<{
		close: () => Promise<void>;
	}>;
};

export type ClientTransport = {
	readonly kind: TransportKind;
	connect: () => Promise<FramedConnection>;
};
