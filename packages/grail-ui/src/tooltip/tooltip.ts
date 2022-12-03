import type { Action } from 'svelte/action';
import type { TooltipConfig, TooltipReturn } from './tooltip.types';
import { derived, readable, writable } from 'svelte/store';
import { usePortal } from '../portal';
import { addEventListener } from '../eventListener/eventListener';
import { getPlacement, arrowAttrs } from '../floating/placement';
import { createTimeout } from '../timeout';
import { chain } from '../util/chain';
import { uniqueId } from '../util/id';
import { writableEffect } from '../util/store';
import { noop } from '../util/noop';

export const createTooltip = ({
	positioning = {},
	open = false,
	openDelay = 1000,
	portal = 'body',
	onOpenChange,
}: TooltipConfig = {}): TooltipReturn => {
	const id = uniqueId('tooltip');

	const open$ = writableEffect(open, onOpenChange);

	let cleanup = noop;

	const triggerAttrs = derived(open$, (open) => (open ? { 'aria-describedby': id } : {}));
	const tooltipAttrs = readable({ id: id, role: 'tooltip' });

	function init(triggerElement: HTMLElement, tooltipElement: HTMLElement) {
		cleanup();
		cleanup = getPlacement(triggerElement, tooltipElement, positioning);
	}

	const {
		start: startShowTimer,
		stop: stopShowTimer,
		delay: delayShowTimer,
	} = createTimeout(() => open$.set(true), 0, { immediate: false });

	const { start: startHideTimer, stop: stopHideTimer } = createTimeout(
		() => open$.set(false),
		500,
		{
			immediate: false,
		}
	);

	const tooltipElement$ = writable<HTMLElement | null>(null);

	const useTooltipTrigger: Action<HTMLElement, void> = (element) => {
		const removeEvents = chain(
			addEventListener(element, 'focus', () => show()),
			addEventListener(element, 'blur', hide),
			addEventListener(element, 'pointerenter', () => show(openDelay)),
			addEventListener(element, 'pointerleave', hide),
			addEventListener(element, 'click', hide)
		);

		const unsubscribe = derived([open$, tooltipElement$], (values) => values).subscribe(
			([$open, $tooltipElement]) => {
				if ($open && $tooltipElement) {
					init(element, $tooltipElement);
				} else {
					cleanup();
				}
			}
		);

		return {
			destroy() {
				cleanup();
				removeEvents();
				unsubscribe();
				hide();
			},
		};
	};

	const useTooltip: Action<HTMLElement, void> = (element) => {
		const portalAction = portal ? usePortal(element, { target: portal }) : undefined;
		tooltipElement$.set(element);

		const removeEvents = chain(
			addEventListener(element, 'pointerenter', () => show()),
			addEventListener(element, 'pointerleave', hide)
		);

		return {
			destroy() {
				removeEvents();
				portalAction?.destroy?.();
				tooltipElement$.set(null);
			},
		};
	};

	const show = (delay = 0) => {
		stopHideTimer();
		delayShowTimer.set(delay);
		startShowTimer();
	};
	const hide = () => {
		stopShowTimer();
		startHideTimer();
	};
	const toggle = () => open$.update((value) => !value);

	return {
		useTooltipTrigger,
		triggerAttrs,
		useTooltip,
		tooltipAttrs,
		arrowAttrs: arrowAttrs(),
		open: open$,
		show,
		hide,
		toggle,
	};
};