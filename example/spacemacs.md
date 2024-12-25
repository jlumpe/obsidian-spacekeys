Example Spacekeys keymap file emulating Spacemacs.

```yaml
items:

  # SPC: command-palette:open
  SPC: obsidian-better-command-palette:open-better-commmand-palette
  TAB: workspace:previous-tab
  /: global-search:open
  1: workspace:goto-tab-1
  2: workspace:goto-tab-2
  3: workspace:goto-tab-3
  4: workspace:goto-tab-4
  5: workspace:goto-tab-5
  6: workspace:goto-tab-6
  7: workspace:goto-tab-7
  8: workspace:goto-tab-8
  9: workspace:goto-last-tab

  b:
    description: Buffers
    items:
      d: workspace:close
      n: workspace:next-tab
      p: workspace:previous-tab
      # This is a sub-menu in Spacemacs
      N: file-explorer:new-file-in-current-tab
      u: workspace:undo-close-pane
      # Not sure if there's a good builtin equivalent to this
      # Shows open buffers and recent files
      b: obsidian-better-command-palette:open-better-commmand-palette-file-search

  f:
    description: Files
    items:
      D: app:delete-file
      # Similar to bb
      f: obsidian-better-command-palette:open-better-commmand-palette-file-search
      o: open-with-default-app:open
      R: workspace:edit-file-title
      s: editor:save-file
      t: file-explorer:open
      T: file-explorer:reveal-active-file

  i:
    description: Insert
    items:
      l: editor:insert-link
      w: editor:insert-wikilink

  m:
    # Generally "Major mode" in Spacemacs, in this case Markdown
    description: Markdown
    items:
    
      c:
        description: Command
        items:
          e: workspace:export-pdf
          p: markdown:toggle-preview
          P: editor:toggle-source

      i:
        description: Insert
        items:
          l: editor:insert-link
          w: editor:insert-wikilink
          T: editor:insert-table

      # This is a menu with one item in Markdown mode
      l: editor:toggle-bullet-list

      t:
        description: Table
        items:
          b: editor:table-col-left
          f: editor:table-col-right
          p: editor:table-row-up
          n: editor:table-row-down
          c: editor:table-col-after
          r: editor:table-row-after
          C: editor:table-col-delete
          R: editor:table-row-delete

      x:
        description: Text
        items:
          b: editor:toggle-bold
          i: editor:toggle-italics
          c: editor:toggle-code
          p: editor:insert-codeblock
          q: editor:toggle-blockquote
          s: editor:toggle-strikethrough

  p:
    # Treat Spacemacs Projectile project <-> Obsidian vault
    description: Projects
    items:
      t: file-explorer:open
      # These are the same?
      p: app:open-vault
      l: app:open-vault
        # Is this the same as org tags or different?
      g: obsidian-better-command-palette:open-better-commmand-palette-tag-search
      f: obsidian-better-command-palette:open-better-commmand-palette-file-search

  s:
    description: Search
    items:
      p: global-search:open

  t:
    description: Toggles
    items:

  w:
    description: Windows
    items:
      TAB: editor:focus
      d: workspace:close-window
      h: editor:focus-left
      l: editor:focus-right
      k: editor:focus-top
      j: editor:focus-bottom
      s: workspace:split-horizontal
      v: workspace:split-vertical

  x:
    description: Text
    items:

  T:
    description: UI Toggles / Themes
    items:
      s: theme:switch
```
