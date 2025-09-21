# Change Log


## Unreleased


## 0.5.0

- New features:
	- Add support for opening files (#9, thanks again to @Moyf).
	- Display assigned key sequences in "Find Command ID" modal.
	- Add some additional customizable CSS variables.
- Bug fixes:
	- Fix activate-on-space triggering when editing property values or formulas in embedded bases.
- Internals:
	- Some internal refactoring.
	- Improve unit test coverage.


## 0.4.0

- Auto reload keymap on file change (#10).
- Experimental "activate on space" feature.
- "Repeat last" command (by default mapped to `.`).
- Better handling/reporting of keymap file errors.


## 0.3.1

- Require minimum Obsidian version 1.7.
- Minor refactoring and updates to internals.


## 0.3.0

- Significant revamp of suggestion interface, more similar to Emacs/Vim which-key:
	- Shown at bottom of screen.
	- Compact, multi-column layout.
	- Displays in-progress key sequence.
	- Configurable delay before showing suggestions.
	- Closes with error message when an invalid sequence is entered.
- Support non-printable keys and modifier keys.
- Option to have custom key map file extend the default instead of redefining it.
- Additional settings to customize behavior and appearance.


## 0.2.0

- Fix loading keymap file on app start.
- Much more complete default keymap.
- Revamp settings tab:
    - Button to create new keymap file with default contents.
    - Buttons to reload and edit keymap.
    - Detailed error messages.
- Create/update README.


## 0.1.0

Initial release.
