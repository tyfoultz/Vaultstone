import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import type { WorldPage } from '@vaultstone/types';
import { getTemplate } from '@vaultstone/content';

// A pin the editor can link to — shaped to the minimum fields the popover
// and insert-step need so the route can stay decoupled from MapPin/PinType.
export type MentionPinItem = {
  id: string;
  mapId: string;
  label: string;
  mapLabel: string;
  icon: string;
};

// A timeline event the editor can link to. id is the parent timeline page id
// (for body_refs backlinks), eventId is the actual event row (for routing).
export type MentionEventItem = {
  id: string;
  eventId: string;
  label: string;
  timelineTitle: string;
  icon: string;
};

type MentionItem =
  | {
      kind: 'page';
      id: string;
      label: string;
      meta: string;
      icon: string;
    }
  | {
      kind: 'pin';
      id: string;
      mapId: string;
      label: string;
      meta: string;
      icon: string;
    }
  | {
      kind: 'event';
      id: string;
      eventId: string;
      label: string;
      meta: string;
      icon: string;
    };

type SuggestionListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SuggestionListProps = {
  items: MentionItem[];
  command: (item: MentionItem) => void;
};

const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') {
            setSelected((s) => (items.length === 0 ? 0 : (s + 1) % items.length));
            return true;
          }
          if (event.key === 'ArrowUp') {
            setSelected((s) =>
              items.length === 0 ? 0 : (s - 1 + items.length) % items.length,
            );
            return true;
          }
          if (event.key === 'Enter') {
            const item = items[selected];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) {
      return <div className="vaultstone-mention-empty">No matches</div>;
    }

    return (
      <div className="vaultstone-mention-list" role="listbox">
        {items.map((item, idx) => (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            role="option"
            aria-selected={idx === selected}
            className={
              idx === selected
                ? 'vaultstone-mention-item is-active'
                : 'vaultstone-mention-item'
            }
            onMouseEnter={() => setSelected(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
          >
            <span className="vaultstone-mention-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="vaultstone-mention-text">
              <span className="vaultstone-mention-title">{item.label}</span>
              <span className="vaultstone-mention-meta">
                {item.kind === 'pin'
                  ? `Pin · ${item.meta}`
                  : item.kind === 'event'
                    ? `Event · ${item.meta}`
                    : item.meta}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);
SuggestionList.displayName = 'SuggestionList';

function pageToItem(page: WorldPage, sectionLabel: string): MentionItem {
  let icon = '◆';
  try {
    const tpl = getTemplate(
      page.template_key as Parameters<typeof getTemplate>[0],
      page.template_version,
    );
    icon = tpl.icon ?? icon;
  } catch {
    // template lookup may fail for legacy/custom; fall back to default
  }
  return {
    kind: 'page',
    id: page.id,
    label: page.title,
    meta: sectionLabel,
    icon,
  };
}

function pinToItem(pin: MentionPinItem): MentionItem {
  return {
    kind: 'pin',
    id: pin.id,
    mapId: pin.mapId,
    label: pin.label,
    meta: pin.mapLabel,
    icon: pin.icon,
  };
}

function eventToItem(ev: MentionEventItem): MentionItem {
  return {
    kind: 'event',
    id: ev.id,
    eventId: ev.eventId,
    label: ev.label,
    meta: ev.timelineTitle,
    icon: ev.icon,
  };
}

type GetPages = () => WorldPage[];
type GetPins = () => MentionPinItem[];
type GetEvents = () => MentionEventItem[];
type GetSectionLabel = (sectionId: string) => string;

const MAX_ITEMS = 8;

export function createMentionSuggestion(
  getPages: GetPages,
  getSectionLabel: GetSectionLabel,
  getPins?: GetPins,
  getEvents?: GetEvents,
): Omit<SuggestionOptions, 'editor'> {
  return {
    char: '@',
    allowSpaces: false,
    items: ({ query }) => {
      const q = query.trim().toLowerCase();
      const pages = getPages();
      const pins = getPins ? getPins() : [];
      const events = getEvents ? getEvents() : [];
      const pageMatches = q
        ? pages.filter((p) => p.title.toLowerCase().includes(q))
        : pages;
      const pinMatches = q
        ? pins.filter((p) => p.label.toLowerCase().includes(q))
        : pins;
      const eventMatches = q
        ? events.filter((e) => e.label.toLowerCase().includes(q))
        : events;
      const pageItems = pageMatches
        .slice(0, MAX_ITEMS)
        .map((p) => pageToItem(p, getSectionLabel(p.section_id)));
      const pinItems = pinMatches.slice(0, MAX_ITEMS).map(pinToItem);
      const eventItems = eventMatches.slice(0, MAX_ITEMS).map(eventToItem);
      return [...pageItems, ...pinItems, ...eventItems].slice(0, MAX_ITEMS);
    },
    command: ({ editor, range, props }) => {
      const item = props as MentionItem;
      const attrs =
        item.kind === 'pin'
          ? { id: item.id, label: item.label, kind: 'pin', mapId: item.mapId }
          : item.kind === 'event'
            ? { id: item.id, label: item.label, kind: 'event' }
            : { id: item.id, label: item.label };
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: 'vaultstoneMention',
            attrs,
          },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      let listRef: SuggestionListHandle | null = null;

      function mount() {
        container = document.createElement('div');
        container.className = 'vaultstone-mention-popup';
        document.body.appendChild(container);
        root = createRoot(container);
      }

      function position(rect: DOMRect | null | undefined) {
        if (!container || !rect) return;
        const top = rect.bottom + window.scrollY + 6;
        const left = rect.left + window.scrollX;
        container.style.position = 'absolute';
        container.style.top = `${top}px`;
        container.style.left = `${left}px`;
      }

      function render(props: SuggestionProps<MentionItem, MentionItem>) {
        if (!root) return;
        root.render(
          <SuggestionList
            items={props.items}
            command={(item) => props.command(item)}
            ref={(r) => {
              listRef = r;
            }}
          />,
        );
      }

      return {
        onStart: (props) => {
          mount();
          position(props.clientRect?.());
          render(props);
        },
        onUpdate: (props) => {
          position(props.clientRect?.());
          render(props);
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            return true;
          }
          return listRef?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          root?.unmount();
          container?.remove();
          root = null;
          container = null;
          listRef = null;
        },
      };
    },
  };
}
