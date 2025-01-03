# Spacekeys

Spacekeys is a plugin for [Obsidian](https://obsidian.md) that allows you to execute commands based on simple sequences of keypresses, inspired by the [Spacemacs](https://www.spacemacs.org/) Emacs distribution. This allows for accessing most of Obsidian's functionality quickly through the keyboard without needing to assign and memorize dozens of complicated hotkey combinations.

It works by activating a single "leader" hotkey (user-assignable, for example <kbd>Ctrl</kbd> + <kbd>M</kbd>) followed by the key sequence for a specific command, e.g. <kbd>i</kbd> <kbd>l</kbd> for **i**nsert → **l**ink.

This has the following advantages over traditional hotkeys:

- Easier to remember: keys are assigned based on simple mnemonics.
- Easier to learn: activating the leader hotkey displays a menu with all available commands. Similar commands are organized under the same prefix keys, e.g. <kbd>f</kbd> for **F**ile, or <kbd>w</kbd> for **W**indow/**W**orkspace. These are visually displayed as submenus.

The keymap is customizable and can include any command that can be assigned a traditional hotkey, including those defined in other plugins.


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

All functionality is accessed through a single "leader" hotkey. This is a standard Obsidian hotkey that you will need to assign yourself (in accordance with Obsidian's plugin guidelines, Spacekeys does not define any hotkeys by default). Navigate to the "Hotkeys" section of Obsidian's settings and use the search function to find the `Spacekeys: Leader` command. To mimic Spacemacs, you can assign it to <kbd>Ctrl</kbd> + <kbd>M</kbd> (which is not bound by default).

After activating the leader hotkey you may immediately enter the key sequence for the desired command if you have it memorized. To aid in discovering commands, a pop-up menu is also displayed showing valid initial keys for all defined sequences. Items with a colored/highlighted key represent groups of commands with a common prefix and are displayed first. The rest are single commands. In the following screenshot, pressing <kbd>Tab</kbd> will immediately execute the "Focus on last note" command. Pressing <kbd>x</kbd> will update the menu to display the next possible key for all defined sequences starting with <kbd>x</kbd>.

![Group vs command](https://raw.githubusercontent.com/jlumpe/obsidian-spacekeys/master/resources/group-vs-command.png)


You can exit the menu by pressing <kbd>Esc</kbd>.


## Customization


### Creating a custom keymap

TODO


### Vim mode leader key

Those using Vim keybindings may want to use a different/additional keybinding depending on the
current Vim mode. This can be done with the help of the
[https://github.com/esm7/obsidian-vimrc-support](https://github.com/esm7/obsidian-vimrc-support)
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

TODO
