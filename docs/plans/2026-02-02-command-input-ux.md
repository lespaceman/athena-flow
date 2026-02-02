# Command Input UX Improvements

## Problems

1. **Unreadable hint text**: Command suggestion descriptions use `color="gray" dimColor` which is nearly invisible on dark terminal backgrounds
2. **No Tab completion**: TextInput's built-in `suggestions` prop only auto-completes on Enter, not Tab. Users expect Tab to complete partial commands.
3. **No arrow key navigation**: Users cannot use up/down arrows to select from the suggestion list. The `selectedIndex` prop exists but is hardcoded to `0`.

## Constraints

- `@inkjs/ui` TextInput explicitly ignores `tab`, `upArrow`, `downArrow` in its `useInput` handler (returns early without processing)
- Multiple `useInput` hooks in the same component tree all receive the same stdin events — a parent hook **can** intercept tab/arrows even though TextInput discards them
- TextInput's `suggestions` prop shows inline dim text for the first alphabetical match only. It does NOT render a list or support cycling.
- TextInput exposes `onChange` and `onSubmit` but no imperative handle to set the value programmatically. We must control value ourselves.

## Approach

Drop TextInput's built-in `suggestions` prop entirely. Instead:

- Keep TextInput for raw text input only (no `suggestions` prop)
- Manage suggestion state (filtered list, selected index) in CommandInput
- Use `useInput` in CommandInput to intercept Tab and arrow keys for navigation
- Tab inserts the selected command name into the input
- Arrow keys cycle through filtered suggestions
- Escape dismisses suggestions

## Changes

### 1. Fix description colors in CommandSuggestions.tsx

**File**: `source/components/CommandSuggestions.tsx`

Current:

```tsx
<Text color="gray" dimColor>{cmd.description}</Text>     // invisible on dark bg
<Text color={i === selectedIndex ? 'cyan' : 'gray'}>     // unselected too dim
```

New:

```tsx
<Text dimColor>{cmd.description}</Text>                   // default color (white) dimmed = readable
<Text color={i === selectedIndex ? 'cyan' : 'white'}>    // white for unselected
```

Also add a visual indicator (e.g. `>`) for the selected suggestion.

### 2. Add keyboard navigation to CommandInput.tsx

**File**: `source/components/CommandInput.tsx`

Add state:

```tsx
const [selectedIndex, setSelectedIndex] = useState(0);
```

Add `useInput` hook (from ink) to handle:

- **Tab**: Accept the currently selected suggestion — set input value to `/{selectedCommand.name} ` and exit command mode
- **Up arrow**: Decrement selectedIndex (wrap around)
- **Down arrow**: Increment selectedIndex (wrap around)
- **Escape**: Clear suggestions by setting value to empty or exiting command mode

Only active when `isCommandMode && filteredCommands.length > 0`.

Reset `selectedIndex` to `0` when the filtered list changes (via useEffect).

Remove TextInput's `suggestions` prop since we handle completion ourselves.

### 3. Programmatic value control

**Problem**: TextInput doesn't expose a `setValue`. The `onChange` callback is one-way (TextInput → parent).

**Solution**: Use the `key` prop to remount TextInput with a new `defaultValue` when Tab completes a command:

```tsx
const [inputKey, setInputKey] = useState(0);
const [defaultValue, setDefaultValue] = useState('');

// On tab completion:
setDefaultValue(`/${selectedCommand.name} `);
setInputKey(k => k + 1); // force remount with new defaultValue
```

TextInput accepts `defaultValue` prop. Remounting via key change resets internal state to the new defaultValue.

### 4. Fix colors in other components (secondary)

Apply same `dimColor` fix pattern to:

- `source/components/HookEvent.tsx` — preview text
- `source/components/SessionEndEvent.tsx` — loading indicator
- `source/app.tsx` — socket path display

Replace `color="gray" dimColor` with just `dimColor` (uses default white, which dims to readable gray).

## File List

| File                                       | Action                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `source/components/CommandSuggestions.tsx` | Edit colors, add selection indicator                                     |
| `source/components/CommandInput.tsx`       | Add useInput for Tab/arrows, manage selectedIndex, drop suggestions prop |
| `source/components/HookEvent.tsx`          | Fix dimColor readability                                                 |
| `source/components/SessionEndEvent.tsx`    | Fix dimColor readability                                                 |
| `source/app.tsx`                           | Fix dimColor readability                                                 |

## Testing

- Unit test: CommandSuggestions renders selected indicator at correct index
- Unit test: CommandInput key handler cycles selectedIndex on arrow keys
- Unit test: CommandInput Tab completion sets value to selected command
- Manual: Verify colors are readable on dark terminal background
- Manual: Type `/` → see suggestions → arrow down → Tab to complete → verify input populated

## Sequence

1. Fix colors (CommandSuggestions + secondary components) — immediate visual improvement
2. Add selectedIndex state management + arrow key navigation
3. Add Tab completion with TextInput remount pattern
4. Add tests
5. Verify lint + typecheck + test suite
