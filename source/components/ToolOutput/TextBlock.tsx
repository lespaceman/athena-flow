import React from 'react';
import MarkdownText from './MarkdownText.js';

type Props = {
	content: string;
};

export default function TextBlock({content}: Props): React.ReactNode {
	return <MarkdownText content={content} />;
}
