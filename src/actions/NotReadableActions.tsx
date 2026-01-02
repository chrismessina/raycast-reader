import { ActionPanel, Action, Icon, Keyboard } from "@raycast/api";

interface NotReadableActionsProps {
  url: string;
  onRetryWithoutCheck: () => void;
}

export function NotReadableActions({ url, onRetryWithoutCheck }: NotReadableActionsProps) {
  return (
    <ActionPanel>
      <Action
        title="Try Anyway"
        icon={Icon.ArrowRight}
        onAction={onRetryWithoutCheck}
        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
      />
      <Action.OpenInBrowser
        title="Open in Browser"
        url={url}
        shortcut={Keyboard.Shortcut.Common.Open}
        icon={Icon.Globe}
      />
      <Action.CopyToClipboard title="Copy URL" content={url} shortcut={Keyboard.Shortcut.Common.Copy} />
    </ActionPanel>
  );
}
