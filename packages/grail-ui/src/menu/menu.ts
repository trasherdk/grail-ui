import type { Action } from 'svelte/action';
import type { MenuConfig, MenuReturn } from './menu.types';
import { tick } from 'svelte';
import { derived, get, readable, writable } from 'svelte/store';
import { addEventListener } from '../eventListener/eventListener';
import { usePortal } from '../portal';
import { getPlacement } from '../floating/placement';
import { useClickOutside } from '../clickOutside';
import { listKeyManager } from '../keyManager/listKeyManager';
import { chain } from '../util/chain';
import { uniqueId } from '../util/id';
import { DOWN_ARROW, ENTER, ESCAPE, SPACE, TAB, UP_ARROW } from '../util/keyboard';
import { noop } from '../util/noop';
import { writableEffect } from '../util/store';

const getMenuItems = (parent: HTMLElement) =>
	Array.from(parent.querySelectorAll<HTMLElement>('[role=menuitem]'));

export const createMenu = ({
	positioning = {},
	open = false,
	portal = null,
	onOpenChange,
	ariaLabel = 'Menu',
}: MenuConfig = {}): MenuReturn => {
	const id = uniqueId('menu');
	const getTrigger = () => document.getElementById(id) as HTMLElement | null;

	const open$ = writableEffect(open, async (isOpen) => {
		if (isOpen) {
			await tick();
			get(overlayElement$)?.focus();
		}
		onOpenChange?.(isOpen);
	});

	let cleanup = noop;

	const triggerAttrs = derived(open$, (open) => ({
		id,
		'aria-haspopup': 'true',
		'aria-expanded': `${open}`,
	}));
	const menuAttrs = readable({ role: 'menu', 'aria-label': ariaLabel, tabindex: '-1' });
	const separatorAttrs = readable({
		role: 'separator',
		'aria-orientation': 'horizontal',
		tabindex: '-1',
	});

	const items = writable<HTMLElement[]>([]);
	const keyManager = listKeyManager({
		items,
		typeahead: true,
		homeAndEnd: true,
		wrap: false,
		vertical: true,
		skipPredicate: (item) => 'disabled' in item.dataset,
		tabOut: () => hide(),
		onActivate: (item) => item.focus(),
	});

	const itemAttrs = derived(keyManager.activeItem, ($activeItem) => {
		return function (attrs: string | { id: number | string; label: string }) {
			const { id, label } = typeof attrs === 'string' ? { id: attrs, label: attrs } : attrs;
			const itemId = `menuitem_${id}`;

			return {
				role: 'menuitem',
				id: itemId,
				tabindex: $activeItem?.id === itemId ? '0' : '-1',
				'data-label': label,
			};
		};
	});

	async function setupPlacement(triggerElement: HTMLElement, overlayElement: HTMLElement) {
		cleanup();
		cleanup = getPlacement(triggerElement, overlayElement, {
			placement: 'bottom',
			...positioning,
		});
	}

	const overlayElement$ = writable<HTMLElement | null>(null);

	const useTrigger: Action<HTMLElement, void> = (element) => {
		async function openMenuWithArrow(e: KeyboardEvent) {
			e.preventDefault();
			open$.set(true);
			await tick();
			e.key === DOWN_ARROW ? keyManager.setFirstItemActive() : keyManager.setLastItemActive();
		}

		const handleKeyDown = async (e: KeyboardEvent) => {
			switch (e.key) {
				case SPACE:
				case ENTER:
					e.preventDefault();
					toggle();
					break;

				case ESCAPE:
					e.preventDefault();
					hide(false);
					break;

				case TAB:
					hide(false);
					break;

				case DOWN_ARROW:
				case UP_ARROW:
					openMenuWithArrow(e);
					break;
			}
		};

		const removeEvents = chain(
			addEventListener(element, 'click', toggle),
			addEventListener(element, 'keydown', handleKeyDown)
		);

		const unsubscribe = derived([open$, overlayElement$], (values) => values).subscribe(
			([$open, $overlayElement]) => {
				if ($open && $overlayElement) {
					setupPlacement(element, $overlayElement);

					items.set(getMenuItems($overlayElement));
				} else {
					keyManager.setActiveItem(-1);
					cleanup();
				}
			}
		);

		return {
			destroy() {
				keyManager.destroy();
				cleanup();
				removeEvents();
				unsubscribe();
				hide();
			},
		};
	};

	const useMenu: Action<HTMLElement, void> = (element) => {
		const portalAction = portal ? usePortal(element, { target: portal }) : undefined;
		overlayElement$.set(element);

		const clickOutsideAction = useClickOutside(element, {
			enabled: open$,
			handler: (e: PointerEvent) => {
				if (!e.defaultPrevented && (e.target as Element).id !== id) {
					hide();
				}
			},
		});

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === ESCAPE) {
				hide(true);
				return;
			}

			keyManager.onKeydown(event);
		};

		const removeEvents = chain(
			addEventListener(element, 'keydown', handleKeyDown),
			addEventListener(element, 'pointerover', (e) => {
				if (
					keyManager.currentActiveItem &&
					(e.target as HTMLElement).getAttribute('role') === 'menuitem'
				) {
					keyManager.setActiveItem(e.target as HTMLElement);
				}
			})
		);

		return {
			destroy() {
				removeEvents();
				clickOutsideAction?.destroy?.();
				portalAction?.destroy?.();
				overlayElement$.set(null);
			},
		};
	};

	const hide = (returnFocus = false) => {
		open$.set(false);
		if (returnFocus) {
			getTrigger()?.focus();
		}
	};
	const toggle = () => {
		open$.update((value) => !value);
	};

	return {
		useTrigger,
		triggerAttrs,
		useMenu,
		menuAttrs,
		itemAttrs,
		separatorAttrs,
		open: open$,
	};
};
