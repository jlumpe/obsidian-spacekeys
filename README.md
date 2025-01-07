# Spacekeys

Spacekeys is a plugin for [Obsidian](https://obsidian.md) that allows you to execute commands based on simple sequences of keypresses, inspired by the [Spacemacs](https://www.spacemacs.org/) Emacs distribution. This allows for accessing most of Obsidian's functionality quickly through the keyboard without needing to assign and memorize dozens of complicated hotkey combinations.

It works by activating a single "leader" hotkey (user-assignable, for example <kbd>Ctrl</kbd> + <kbd>M</kbd>) followed by the key sequence for a specific command, e.g. <kbd>i</kbd> <kbd>l</kbd> for **i**nsert → **l**ink.

This has the following advantages over traditional hotkeys:

- Easier to remember: keys are assigned based on simple mnemonics.
- Easier to learn: activating the leader hotkey displays a menu with all available commands. Similar commands are organized under the same prefix keys, e.g. <kbd>f</kbd> for **F**ile, or <kbd>w</kbd> for **W**indow/**W**orkspace. These are visually displayed as submenus.
- Allows for assigning a large number of commands without things getting too confusing (most of Obsidian's builtin commands are not assigned a standard hotkey by default, but most are included in Spacekey's default keymap).

The keymap is customizable and can include any command that can be assigned a traditional hotkey, including those defined by other plugins.


## Demo

![Group vs command](https://raw.githubusercontent.com/jlumpe/obsidian-spacekeys/master/resources/demo.gif)

1. <kbd>w</kbd> <kbd>N</kbd>: **W**orkspace → **N**ew tab
1. <kbd>f</kbd> <kbd>n</kbd> <kbd>n</kbd>: **F**ile → **N**ew → Create **n**ew note
1. <kbd>i</kbd> <kbd>C</kbd>: **I**nsert → **C**allout
1. <kbd>x</kbd> <kbd>b</kbd>: Te**x**t → Toggle **b**old
1. <kbd>v</kbd> <kbd>r</kbd>: **V**iew → Toggle **r**eading view


## Installation

This plugin is not yet available to be installed through the app and will need to be installed manually. Navigate to the [releases](https://github.com/jlumpe/obsidian-spacekeys/releases/) page, select the most recent release, and download the `main.js`, `styles.css`, and `manifest.json` files. Create the subdirectory `.obsidian/plugins/obsidian-spacekeys/` in your Obsidian vault folder and copy the files to it. Restart Obsidian, open the settings panel, navigate to "Communitiy plugins" → "Installed plugins" → "Spacekeys" and click the toggle to enable it.


## Usage

All functionality is accessed through a single "leader" hotkey. This is a standard Obsidian hotkey that you will need to assign yourself (in accordance with Obsidian's plugin guidelines, Spacekeys does not define any hotkeys by default). Navigate to the "Hotkeys" section of Obsidian's settings and use the search function to find the `Spacekeys: Leader` command. A good choice is <kbd>Ctrl</kbd> + <kbd>M</kbd> (which is not bound by default).

After activating the leader hotkey you may immediately enter the key sequence for the desired command if you have it memorized. To aid in discovering commands, a pop-up menu is also displayed showing valid initial keys for all defined sequences. Items with a colored/highlighted key represent groups of commands with a common prefix and are displayed first. The rest are single commands. In the following screenshot, pressing <kbd>Tab</kbd> will immediately execute the "Focus on last note" command. Pressing <kbd>x</kbd> will update the menu to display the next possible key for all defined sequences starting with <kbd>x</kbd> (which are all text-related).

![Group vs command](https://raw.githubusercontent.com/jlumpe/obsidian-spacekeys/master/resources/group-vs-command.png)

You can exit the menu by pressing <kbd>Esc</kbd>.


## Customization

### Creating a custom keymap

#### Source file

Custom keymaps can be defined in a YAML file in your Obsidian vault. Open Obsidian's settings and navigate to "Community Plugins" → "Spacekeys." In the "Spacekeys keymap file" section, set the "Path" field to the location of the config file relative to your vault's root directory (e.g., `_config/spacekeys.yml`). If the file does not yet exist, you can use the "Create file with default contents" button at the top of the settings menu to initialize the file from the default keymap. Then click the "Open file for editing" button (this will open an external editor program if it is a pure YAML file).

To facilitate editing within Obsidian, you may also use a Markdown file where the YAML is contained within a code block (enclosed by triple backicks). The "Create file with default contents" button will create a file formatted this way if the supplied path has the `.md` extension.

After creating/editing the file, use the "(Re)load keymap from file" button in the settings tab or the `Spacekeys: Reload keymap` command from the command palette. If there are errors parsing the file, the button in the settings tab will display more detailed error messages.


#### Format

The following YAML defines a simple keymap:

```yaml
# Root command group
items:
  # Command mapped to key sequence "/"
  /:
    command: global-search:open
    description: Search in all files

  # A group of commands with common prefix key "f"
  f:
    description: File
    items:
      # Command mapped to "f d"
      d:
        command: app:delete-file
        description: Delete file
      # Command mapped to "f m"
      # This uses the short form, with description determined automatically
      m: file-explorer:move-file
```

It contains two types of objects:

**Command groups** contain an `items` property. The root YAML value is a command group, and additional groups can be used to combine related commands under a common prefix key. The sub-properties of `items` correspond to single key presses, and their values are commands or more command groups. Command groups can be nested to any level. The `description` property is a string that is displayed in the pop-up menu (not required, but recommended).

**Commands** contain a `command` property that is the command ID to run (see below). They can also have `description` property, but if omitted Spacekeys will use the default description of the command. If not using a custom description you can use the short form, which is just the command ID itself instead of an object with a single property.


#### Valid keys

Any key that corresponds to a printable character can be used, as well as tab and space. Shift is the only supported modifier key. The YAML key string used should be the character produced by pressing the desired combination, so `?` corresponds to <kbd>Shift</kbd> + <kbd>/</kbd>. Note that this means a capital letter is different than a lower case letter.

Some key characters may conflict with YAML syntax. This can be avoided by enclosing the key string in single or double quotes before the colon. For example, `'"': <command or group>` corresponds to <kbd>Shift</kbd> + <kbd>'</kbd>.

The following keys use special strings:

- <kbd>Space</kbd>: `space` or `spc`.
- <kbd>Tab</kbd>: `tab`.


#### Finding command IDs

The `Spacekeys: Find Command ID` command displays a pop up that allows you to search for commands by name or description. Invoke it either through the command palette or by assigning it a hotkey. Making a selection with the <kbd>Enter</kbd> will copy the command ID to the clipboard. Alternatively, you can press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to insert the ID in the currently open editor tab (useful if you are editing your keymap file in markdown format).


### Vim mode leader key

Those using Vim keybindings may want to use a different/additional keybinding depending on the
current Vim mode. This can be done with the help of the
[obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support)
plugin. Add the following lines to your `.vimrc` file to bind the action to the space key in
normal and visual/select mode:

```
" Spacekeys leader
exmap spacekeysleader obcommand spacekeys:leader
nmap <Space> :spacekeysleader<CR>
vmap <Space> :spacekeysleader<CR>
```


## Roadmap

- [ ] Better default/example keymap.
- [ ] Use a different modal interface, more similar to Spacemacs.
  - [ ] Bottom of screen, full width with more compact layout (multiple columns).
  - [ ] Short delay until displaying modal. Display current key sequence in status bar.
- [ ] Alternate context-sensitive keymaps (e.g. when file browser side bar is active).
- [ ] Set Vim keybinding without needing vimrc plugin.


## Similar plugins

| Plugin                                                                                | Downloads | Last updated |
| ------------------------------------------------------------------------------------- | --------- | ------------ |
| [Leader Hotkeys](https://github.com/tgrosinger/leader-hotkeys-obsidian)               | 11,600    | 2y           |
| [Sequence Hotkeys](https://github.com/moolmanruan/obsidian-sequence-hotkeys)          | 6,200     | 1y           |
| [Key Sequence Shortcut](https://github.com/anselmwang/obsidian-key-sequence-shortcut) | 4,600     | 3y           |
| [Chorded hotkeys](https://github.com/ConnorMeyers/obsidian-chorded-hotkeys)           | 4,400     | 1y           |
| [Hotkeys Chords](https://github.com/trenta3/obsidian-hotkeys-chords)                  | 4,000     | 3y           |
