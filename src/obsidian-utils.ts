import { App, TFile, PaneType, Modal, FileView, WorkspaceLeaf, Workspace, Command, SuggestModal, Notice } from 'obsidian';

/**
 * Get command from app by ID.
 * This doesn't seem to be an officially supported API.
 */
export function getCommandById(app: App, id: string): Command | null {
	// @ts-expect-error: not-typed
	const result = app.commands.findCommand(id);
	return result ?? null;
}

/**
 * Get list of all defined commands, including commands not available in the current context.
 * As with the previous function, this doesn't appear to be in the official API.
 */
export function listCommands(app: App): Command[] {
	// @ts-expect-error: not-typed
	return Object.values(app.commands.commands);
}

/**
 * Find an existing workspace leaf that is viewing the given file.
 */
function findLeafWithFile(workspace: Workspace, file: TFile): WorkspaceLeaf | null {
	for (const leaf of workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof FileView && leaf.view.file === file)
			return leaf;
	}
	return null;
}

/**
 * @prop newLeaf - Argument to app.workspace.getLeaf().
 * @prop active - Whether to make the tab active after opening.
 * @prop useExisting - If true and there is an existing tab/view with the file open, focus on that
 *                     tab (if active=true) instead of creating a new one.
 * @prop external - Whether to expect the file to be opened in an external application (which is
 *                  what will happen if it is a non-Markdown file). The default is true if the file
                    has the ".md" extension. If true it overrides the other settings.
 */
export interface OpenFileOpts {
	newLeaf?: PaneType | boolean;
	active?: boolean;
	useExisting?: boolean;
	external?: boolean;
}

/**
 * Find a file by name, with or without extension.
 * This function will search for files with the given name, regardless of their location in the vault.
 * @param app - The Obsidian app instance.
 * @param fileName - The name of the file to find, with or without extension.
 * @returns The found TFile or null if not found.
 */
export function findFileByName(app: App, fileName: string): TFile | null {
	// Remove .md extension if present
	const baseName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
	
	// Get all markdown files in the vault
	const files = app.vault.getMarkdownFiles();
	
	// Find the first file that matches the name (case insensitive)
	const file = files.find(f => f.basename.toLowerCase() === baseName.toLowerCase()) || null;
	
	return file;
}

/**
 * Open the given file in the vault.
 *
 * This should open the file in an external editor if it is not a Markdown file.
 */
export async function openFile(app: App, file: string | TFile, opts: OpenFileOpts = {}) {
	let tfile: TFile | null = null;
	
	if (file instanceof TFile) {
		tfile = file;
	} else {
		// First try to get file by exact path
		tfile = app.vault.getFileByPath(file);
		
		// If not found, try to find by name
		if (!tfile) {
			tfile = findFileByName(app, file);
		}
	}
	
	if (!tfile) {
		new Notice(`File not found: ${file}`);
		return;
	}

	const external = opts.external ?? tfile.extension !== 'md';

	// Try to find existing tab
	if (!external && (opts.useExisting ?? true)) {
		const existing = findLeafWithFile(app.workspace, tfile);
		if (existing) {
			if (opts.active ?? true)
				app.workspace.setActiveLeaf(existing, {focus: true});
			return;
		}
	}

	const leaf = app.workspace.getLeaf(external ? false : opts.newLeaf);

	// This seems to open the file in an external app if it is not Markdown
	try {
		await leaf.openFile(tfile, {active: external ? false : (opts.active ?? true)});
	} catch (error) {
		new Notice(`File not found:\n${file}`);
	}
}

/**
 * Modal which presents a yes/no option to the user.
 */
export class ConfirmModal extends Modal {
	callback: YesNoCallback | null;
	yesBtn: HTMLButtonElement;
	noBtn: HTMLButtonElement;
	private invoked = false;
	private default: boolean;

	constructor(app: App, opts: YesNoOpts = {}) {
		super(app);

		if (opts.title)
			this.setTitle(opts.title);
		if (opts.message)
			this.setContent(opts.message);

		this.default = opts.default ?? true;

		const buttonsEl = this.modalEl.createEl('div', {cls: 'modal-button-container'});

		this.yesBtn = buttonsEl.createEl('button', {text: opts.yesText ?? 'Confirm'});
		this.yesBtn.addEventListener('click', (ev) => this.resolve(true));
		const yesCls = opts.yesCls ?? 'mod-cta';
		if (yesCls)
			this.yesBtn.addClass(yesCls);

		this.noBtn = buttonsEl.createEl('button', {text: opts.noText ?? 'Cancel'});
		this.noBtn.addEventListener('click', (ev) => this.resolve(false));
		const noCls = opts.noCls ?? 'mod-cancel';
		if (noCls)
			this.noBtn.addClass(noCls);
	}

	open() {
		super.open();

		const defaultBtn = this.default ? this.yesBtn : this.noBtn;
		defaultBtn.focus();
	}

	private resolve(result: boolean): void {
		if (this.callback && !this.invoked) {
			this.invoked = true;
			this.callback(result);
		}
		this.close();
	}
}

/**
 * Add title element to SuggestModal instance.
 */
export function addModalTitle(modal: SuggestModal<any>, text?: string): HTMLElement {
	const { modalEl } = modal;
	const el = createEl('div', { cls: 'spacekeys-modal-title' });
	modalEl.insertBefore(el, modalEl.firstChild);
	if (text)
		el.textContent = text;
	return el;
}

type YesNoCallback = (result: boolean) => void;
interface YesNoOpts {
	default?: boolean;
	message?: string;
	title?: string;
	yesText?: string;
	noText?: string;
	yesCls?: string | null;
	noCls?: string | null;
	callback?: YesNoCallback;
}
