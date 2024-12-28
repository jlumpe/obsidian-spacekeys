import { App, TFile, PaneType, Modal, FileView, WorkspaceLeaf, Workspace } from 'obsidian';


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
 * Open the given file in the vault.
 *
 * This should open the file in an external editor if it is not a Markdown file.
 */
export async function openFile(app: App, file: string | TFile, opts: OpenFileOpts = {}) {
	const tfile = file instanceof TFile ? file : app.vault.getFileByPath(file);
	if (!tfile)
		return;

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
	await leaf.openFile(tfile, {active: external ? false : (opts.active ?? true)});
}


type YesNoCallback = (result: bool) => void;
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
