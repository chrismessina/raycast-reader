import { Detail } from "@raycast/api";
import { EmptyContentActions } from "../actions/EmptyContentActions";

interface EmptyContentViewProps {
  url: string;
  title: string;
}

function buildEmptyContentMarkdown(): string {
  return `# No Readable Content

Well, we tried but there's no readable content at this URL.

The page may be:
- Mostly navigation or UI elements
- Behind a login wall
- Dynamically loaded with JavaScript
- Not designed for reading

You can try opening it in your browser instead.`;
}

export function EmptyContentView({ url, title }: EmptyContentViewProps) {
  const markdown = buildEmptyContentMarkdown();

  return <Detail markdown={markdown} navigationTitle={"No Readable Content"} actions={<EmptyContentActions url={url} />} />;
}
