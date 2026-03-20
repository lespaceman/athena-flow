/**
 * Bounded NDJSON line parser that avoids V8 ConsString chains.
 *
 * Instead of `data += chunk.toString()` (which creates cons-cells that cause
 * SlowFlatten on split), we store raw Buffers and only flatten when a newline
 * byte (0x0A) is found.
 */

const MAX_BUFFER_BYTES = 4_194_304; // 4MB — raised from 1MB because PostToolUse can exceed 1MB

export class BoundedLineParser {
	private chunks: Buffer[] = [];
	private totalBytes = 0;

	/**
	 * Feed a chunk of data. Returns zero or more complete lines.
	 * Each line is a complete NDJSON message (without the trailing newline).
	 */
	feed(chunk: Buffer): string[] {
		const lines: string[] = [];
		let start = 0;

		for (let i = 0; i < chunk.length; i++) {
			if (chunk[i] === 0x0a) {
				// newline byte
				// Add the segment before newline to pending chunks
				const segment = chunk.subarray(start, i);
				if (segment.length > 0) {
					this.chunks.push(segment);
					this.totalBytes += segment.length;
				}

				// Flatten to string
				if (this.totalBytes > 0) {
					const line = Buffer.concat(this.chunks).toString('utf8');
					if (line.length > 0) {
						lines.push(line);
					}
				}

				// Reset for next line
				this.chunks = [];
				this.totalBytes = 0;
				start = i + 1;
			}
		}

		// Remainder after last newline (or entire chunk if no newline)
		if (start < chunk.length) {
			const remainder = chunk.subarray(start);
			this.totalBytes += remainder.length;

			// Check overflow BEFORE storing
			if (this.totalBytes > MAX_BUFFER_BYTES) {
				// Reset buffer — discard incomplete line
				// The next JSON.parse failure in the caller will handle the error
				this.reset();
				return lines;
			}

			this.chunks.push(remainder);
		}

		return lines;
	}

	/** Clear all buffered state. */
	reset(): void {
		this.chunks = [];
		this.totalBytes = 0;
	}
}
