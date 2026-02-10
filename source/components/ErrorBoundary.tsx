import React, {type ReactNode} from 'react';
import {Text} from 'ink';

type Props = {
	children: ReactNode;
	fallback?: ReactNode;
};

type State = {
	error: Error | null;
};

/**
 * Error boundary that catches render-phase errors in child components.
 * Must be a class component — React has no hook equivalent for error boundaries.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
	state: State = {error: null};

	static getDerivedStateFromError(error: Error): State {
		return {error};
	}

	render() {
		if (this.state.error) {
			return (
				this.props.fallback ?? (
					<Text color="red">[render error: {this.state.error.message}]</Text>
				)
			);
		}
		return this.props.children;
	}
}
