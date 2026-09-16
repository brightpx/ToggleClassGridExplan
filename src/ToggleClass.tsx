import { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
// Provided by the Mendix runtime, it renders glyphs and images with the styling of the theme.
import { Icon } from "mendix/components/web/Icon";

import { ToggleClassContainerProps } from "../typings/ToggleClassProps";
import { ToggleButton } from "./components/ToggleButton";
import "./ui/ToggleClass.css";

/** Maximum number of wrapper elements to step up while looking for the element below the button. */
const MAX_WRAPPER_DEPTH = 3;

/** Data attributes used to remember the inline display value the element had before it was hidden. */
const PREVIOUS_DISPLAY_KEY = "toggleClassPreviousDisplay";
const PREVIOUS_PRIORITY_KEY = "toggleClassPreviousDisplayPriority";

/** Selectors that identify a table cell (the column the widget is dropped in). */
const CELL_SELECTOR = "td, .td";

/** Selectors that identify the row the widget is dropped in. */
const ROW_SELECTOR = "tr, .tr";

/**
 * Class added to the cell that holds the content of the row, so it drops below the row at full
 * width while the button itself stays in its own column. A page or a theme can restyle (or disable)
 * the behaviour with its own `.widget-toggleclass-full-row` rule.
 */
const FULL_ROW_CLASS = "widget-toggleclass-full-row";

/**
 * Class added to the row while content that lives in the widget's own cell breaks out of it. The row
 * becomes the positioning context and reserves the height of the content, so the content spans the
 * whole row below it while the button stays in its own column.
 */
const ROW_CLASS = "widget-toggleclass-row";

/** Class added to the content that breaks out of the widget's own cell. */
const ROW_CONTENT_CLASS = "widget-toggleclass-row-content";

/** Inline properties that are set while animating and are restored afterwards. */
const ANIMATED_PROPERTIES = ["height", "opacity", "overflow", "padding-top", "padding-bottom", "transition"] as const;

/** Extra time (ms) added to the animation timer, so the browser can finish the transition first. */
const ANIMATION_GRACE_MS = 40;

/** Number of animation frames waited for the target to show up when the page finishes loading. */
const INITIAL_LOOKUP_FRAMES = 30;

/** Saved inline values of the properties that are used while animating, per element. */
const savedStyles = new WeakMap<HTMLElement, Map<string, string>>();

/** Pending animation timers, so a second click cancels the animation of the first one. */
const pendingTimers = new WeakMap<HTMLElement, number>();

type AnimationKind = ToggleClassContainerProps["animation"];

/** Which element is toggled: the whole cell after the button, or only the nearest element. */
type TargetMode = ToggleClassContainerProps["targetMode"];

interface ToggleOptions {
    animation: AnimationKind;
    duration: number;
}

/** How the content that is toggled is laid out when it does not fit in the column of the widget. */
type RowLayout =
    /** The content is toggled exactly where the page laid it out. */
    | "none"
    /** The cell next to the widget holds the content and spans the whole row. */
    | "cell"
    /** The content lives in the widget's own cell and breaks out below the row. */
    | "breakout";

interface ResolvedTarget {
    /** The element that is shown / hidden. */
    element: HTMLElement;
    /** How the content is laid out, see `RowLayout`. */
    layout: RowLayout;
    /** The row the content breaks out of, only set when the layout is `breakout`. */
    row: HTMLElement | null;
}

/** A target that is toggled exactly where the page laid it out. */
function plainTarget(element: HTMLElement): ResolvedTarget {
    return { element, layout: "none", row: null };
}

/**
 * Finds the element that sits directly below the button. Mendix and the layout can add wrapper
 * elements around the widget, so we walk up those wrappers as long as they contain nothing but
 * this widget and take the first sibling element we find.
 */
function findElementBelow(button: HTMLButtonElement): HTMLElement | null {
    let current: HTMLElement | null = button;

    for (let depth = 0; current && depth <= MAX_WRAPPER_DEPTH; depth++) {
        const sibling = current.nextElementSibling;
        if (sibling instanceof HTMLElement) {
            return sibling;
        }

        const parent: HTMLElement | null = current.parentElement;
        if (!parent || parent === document.body || parent.children.length !== 1) {
            return null;
        }
        current = parent;
    }

    return null;
}

/**
 * Turns the configured selector into the list of CSS selectors that are tried, in order.
 * A plain class list such as `mx-name-container30 lv2-content` is not a selector for an element
 * with both classes, so it is also tried as `.mx-name-container30.lv2-content`.
 */
function buildSelectorCandidates(selector: string): string[] {
    const trimmed = selector.trim();
    if (!trimmed) {
        return [];
    }

    const candidates = [trimmed];
    const tokens = trimmed.split(/\s+/);
    if (tokens.every(token => /^[A-Za-z_][\w-]*$/.test(token))) {
        candidates.push(tokens.map(token => `.${token}`).join(""));
    }

    return candidates;
}

/** Queries `root` with every candidate selector and returns the first element that matches. */
function queryElement(root: ParentNode, selector: string): HTMLElement | null {
    for (const candidate of buildSelectorCandidates(selector)) {
        try {
            const element = root.querySelector<HTMLElement>(candidate);
            if (element) {
                return element;
            }
        } catch {
            // Not a valid CSS selector, just try the next candidate.
        }
    }

    return null;
}

/**
 * Steps up from the matched element to the cell (`td` / `.td`) it lives in, as long as that cell
 * holds nothing but the matched element. This way the whole column disappears instead of only the
 * inner part of it, which would leave the cell padding and borders behind as an empty gap.
 */
function promoteToCell(element: HTMLElement): HTMLElement {
    let current = element;

    for (let depth = 0; depth <= MAX_WRAPPER_DEPTH; depth++) {
        const parent: HTMLElement | null = current.parentElement;
        if (!parent) {
            return element;
        }

        if (parent.matches(CELL_SELECTOR)) {
            const holdsOnlyCurrent = Array.from(parent.children).every(
                child => child === current || !(child.textContent ?? "").trim()
            );
            return holdsOnlyCurrent ? parent : element;
        }

        if (parent.children.length !== 1) {
            return element;
        }
        current = parent;
    }

    return element;
}

/**
 * Resolves the element that matches the configured target selector. The cell of the widget and the
 * cell next to it are searched first, so a selector like `mx-name-container30 lv2-content` also
 * finds the content of the column next to the button - typical for the `td` after a button in a
 * (Mendix) grid row.
 *
 * `targetMode` decides how much is hidden:
 * - `nextCell`: the whole cell (`td`) the target lives in is hidden, so no cell padding or borders
 *   are left behind as an empty gap.
 * - `nearest`: only the target itself is hidden, the surrounding cell stays visible.
 */
function findTargetBySelector(
    button: HTMLButtonElement,
    selector: string,
    targetMode: TargetMode
): ResolvedTarget | null {
    const elementBelow = findElementBelow(button);

    const roots: ParentNode[] = [];
    const cell = button.closest<HTMLElement>(CELL_SELECTOR);
    if (cell) {
        roots.push(cell);
    }

    // The cell next to the widget is searched before the page, so in a grid with several rows every
    // button toggles the column of its own row instead of the first match in the document.
    const nextCell = cell?.nextElementSibling;
    if (nextCell instanceof HTMLElement) {
        roots.push(nextCell);
    }
    if (elementBelow) {
        roots.push(elementBelow);
    }

    const row = button.closest<HTMLElement>(ROW_SELECTOR);
    if (row) {
        roots.push(row);
    }
    roots.push(document);

    for (const root of roots) {
        const element = queryElement(root, selector);
        if (element) {
            if (targetMode === "nearest") {
                return plainTarget(element);
            }
            return plainTarget(row && row.contains(element) ? promoteToCell(element) : element);
        }
    }

    return null;
}

/** Checks whether a cell holds anything visible, so empty spacer cells can be skipped. */
function hasCellContent(cell: HTMLElement): boolean {
    if ((cell.textContent ?? "").trim() !== "") {
        return true;
    }

    return cell.querySelector("img, svg, video, canvas, iframe, input, textarea, select, button") !== null;
}

/**
 * The first cell after the widget's own cell that holds content. In a grid row the first cells are
 * the columns of the row and the widget often sits right before the last one, so empty cells in
 * between (columns without a value) are skipped instead of being toggled as an empty gap.
 */
function findNextCellWithContent(button: HTMLButtonElement): HTMLElement | null {
    const ownCell = button.closest<HTMLElement>(CELL_SELECTOR);
    if (!ownCell) {
        return null;
    }

    for (let sibling = ownCell.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        if (sibling instanceof HTMLElement && sibling.matches(CELL_SELECTOR) && hasCellContent(sibling)) {
            return sibling;
        }
    }

    return null;
}

/**
 * The row the widget sits in. Content that lives in the widget's own cell can only break out when
 * there is a row to pin it below, which is the case in a grid, where the cell is a child of the row.
 */
function findGridRow(button: HTMLButtonElement): HTMLElement | null {
    const cell = button.closest<HTMLElement>(CELL_SELECTOR);
    const row = cell?.parentElement;
    return row instanceof HTMLElement && row.matches(ROW_SELECTOR) ? row : null;
}

/**
 * Decides what the button toggles.
 *
 * - With a target selector the selector wins (the old behaviour is kept).
 * - Content that follows the button inside its own cell is toggled; inside a grid row it breaks out
 *   of the cell, so it is not squeezed into the narrow column of the button.
 * - When there is nothing to toggle under the button, the content of the cell next to the widget is
 *   used instead (the `nextCellFallback` option) and gets the full row class, so it drops below the
 *   row at full width while the button stays in its own column.
 */
function resolveTarget(
    button: HTMLButtonElement,
    selector: string,
    targetMode: TargetMode,
    nextCellFallback: boolean
): ResolvedTarget | null {
    if (selector.trim()) {
        return findTargetBySelector(button, selector, targetMode);
    }

    const cell = button.closest<HTMLElement>(CELL_SELECTOR);
    const elementBelow = findElementBelow(button);
    const row = findGridRow(button);

    // Content below the button inside the widget's own cell.
    if (elementBelow && (!cell || cell.contains(elementBelow))) {
        let element = targetMode === "nearest" ? elementBelow : promoteToCell(elementBelow);
        if (element.contains(button)) {
            // The whole cell was picked, but that cell holds the button itself: keep the content.
            element = elementBelow;
        }

        return { element, layout: row ? "breakout" : "none", row };
    }

    const wrapUp = (): ResolvedTarget | null =>
        elementBelow ? plainTarget(targetMode === "nearest" ? elementBelow : promoteToCell(elementBelow)) : null;

    if (!nextCellFallback) {
        return wrapUp();
    }

    // Nothing under the button: take the content of the cell next to the widget instead.
    const nextCell = findNextCellWithContent(button);
    if (nextCell) {
        return { element: nextCell, layout: "cell", row: null };
    }

    return wrapUp();
}

/** Inline value of one property, so it can be put back afterwards. */
interface InlineOverride {
    element: HTMLElement;
    property: string;
    value: string;
    priority: string;
}

interface Breakout {
    element: HTMLElement;
    row: HTMLElement;
    /** Keeps the row as tall as the content while it is out of its cell. */
    observer: ResizeObserver | null;
    /** Values of the elements between the content and the row that had to be opened up. */
    overrides: InlineOverride[];
    /** Inline padding of the row, so it can be restored when the content goes back into its cell. */
    rowPadding: string;
    rowPaddingPriority: string;
    /** Pending frame that syncs the height of the row with the content. */
    frame: number;
    /** Ends the breakout once the collapse animation is done, so the row shrinks along with it. */
    timer: number;
}

/** Active breakouts, so a click can find the row that reserves the height of its content. */
const breakouts = new WeakMap<HTMLElement, Breakout>();

/** Keeps the row as tall as the content that broke out of its cell. */
function reserveRowHeight(state: Breakout): void {
    const height = Math.round(state.element.getBoundingClientRect().height);
    if (height > 0) {
        state.row.style.setProperty("padding-bottom", `${height}px`, "important");
    } else {
        state.row.style.removeProperty("padding-bottom");
    }
}

/**
 * Reserving the height changes the height of the row, which can resize the content again. The work is
 * done on the next frame, so the browser is not re-entered while it is delivering resize events.
 */
function scheduleRowHeight(state: Breakout): void {
    if (state.frame) {
        window.cancelAnimationFrame(state.frame);
    }
    state.frame = window.requestAnimationFrame(() => {
        state.frame = 0;
        reserveRowHeight(state);
    });
}

/**
 * Opens up the elements between the content and the row: a grid cell clips what is inside it and
 * themes sometimes position it, both of which would keep the content inside the column of the button
 * instead of letting it span the row. The row itself is left alone, it is the anchor.
 */
function openAncestors(element: HTMLElement, row: HTMLElement): InlineOverride[] {
    const overrides: InlineOverride[] = [];

    const override = (node: HTMLElement, property: string, value: string): void => {
        overrides.push({
            element: node,
            property,
            value: node.style.getPropertyValue(property),
            priority: node.style.getPropertyPriority(property)
        });
        node.style.setProperty(property, value, "important");
    };

    for (let node = element.parentElement; node && node !== row; node = node.parentElement) {
        const computed = window.getComputedStyle(node);
        if (computed.position !== "static") {
            override(node, "position", "static");
        }
        if (computed.overflow !== "visible") {
            override(node, "overflow", "visible");
        }
    }

    return overrides;
}

/** Puts the inline values of the opened up elements back. */
function restoreOverrides(overrides: InlineOverride[]): void {
    overrides.forEach(({ element, property, value, priority }) => {
        if (value) {
            element.style.setProperty(property, value, priority);
        } else {
            element.style.removeProperty(property);
        }
    });
}

/**
 * Lets the content escape the cell it was put in. It is pinned to the bottom of the row and the row
 * reserves its height, so the content spans the whole row instead of being squeezed into the column
 * of the button, while the button itself stays where it is.
 */
function startBreakout(element: HTMLElement, row: HTMLElement): void {
    const active = breakouts.get(element);
    if (active) {
        // A pending cleanup from the collapse animation is no longer needed.
        if (active.timer) {
            window.clearTimeout(active.timer);
            active.timer = 0;
        }
        return;
    }

    const state: Breakout = {
        element,
        row,
        observer: null,
        overrides: openAncestors(element, row),
        rowPadding: row.style.getPropertyValue("padding-bottom"),
        rowPaddingPriority: row.style.getPropertyPriority("padding-bottom"),
        frame: 0,
        timer: 0
    };

    breakouts.set(element, state);
    row.classList.add(ROW_CLASS);
    element.classList.add(ROW_CONTENT_CLASS);

    if (typeof ResizeObserver !== "undefined") {
        state.observer = new ResizeObserver(() => scheduleRowHeight(state));
        state.observer.observe(element);
    }
    reserveRowHeight(state);
}

/** Gives the content back to the cell and the row its own padding. */
function endBreakout(element: HTMLElement): void {
    const state = breakouts.get(element);
    if (!state) {
        return;
    }
    breakouts.delete(element);

    if (state.timer) {
        window.clearTimeout(state.timer);
    }
    if (state.frame) {
        window.cancelAnimationFrame(state.frame);
    }
    if (state.observer) {
        state.observer.disconnect();
    }

    state.row.classList.remove(ROW_CLASS);
    if (state.rowPadding) {
        state.row.style.setProperty("padding-bottom", state.rowPadding, state.rowPaddingPriority);
    } else {
        state.row.style.removeProperty("padding-bottom");
    }
    element.classList.remove(ROW_CONTENT_CLASS);
    restoreOverrides(state.overrides);
}

/** Ends the breakout after the collapse animation, so the row shrinks together with the content. */
function endBreakoutAfterAnimation(element: HTMLElement, duration: number): void {
    const state = breakouts.get(element);
    if (!state) {
        return;
    }
    if (state.timer) {
        window.clearTimeout(state.timer);
    }
    state.timer = window.setTimeout(() => endBreakout(element), duration + ANIMATION_GRACE_MS);
}

/**
 * Resolves the target and prepares the layout of the row it lives in: the cell next to the widget is
 * made full width, and content that sits in the widget's own cell breaks out below the row.
 */
function prepareTarget(
    button: HTMLButtonElement,
    selector: string,
    targetMode: TargetMode,
    nextCellFallback: boolean
): ResolvedTarget | null {
    const resolved = resolveTarget(button, selector, targetMode, nextCellFallback);
    if (!resolved) {
        return null;
    }

    if (resolved.layout === "cell") {
        resolved.element.classList.add(FULL_ROW_CLASS);
    } else if (resolved.layout === "breakout" && resolved.row) {
        startBreakout(resolved.element, resolved.row);
    }

    return resolved;
}

function isHidden(element: HTMLElement): boolean {
    return window.getComputedStyle(element).display === "none";
}

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animationEnabled(options: ToggleOptions): boolean {
    return options.animation !== "none" && options.duration > 0 && !prefersReducedMotion();
}

/** Stores the current inline values of the animated properties, so they can be restored later. */
function snapshotStyles(element: HTMLElement): void {
    if (savedStyles.has(element)) {
        return;
    }

    const snapshot = new Map<string, string>();
    ANIMATED_PROPERTIES.forEach(property => {
        snapshot.set(property, element.style.getPropertyValue(property));
    });
    savedStyles.set(element, snapshot);
}

/** Restores the inline values the animated properties had before the animation started. */
function restoreStyles(element: HTMLElement): void {
    const snapshot = savedStyles.get(element);
    if (!snapshot) {
        return;
    }

    snapshot.forEach((value, property) => {
        if (value) {
            element.style.setProperty(property, value);
        } else {
            element.style.removeProperty(property);
        }
    });
    savedStyles.delete(element);
}

function cancelPendingAnimation(element: HTMLElement): void {
    const timer = pendingTimers.get(element);
    if (timer !== undefined) {
        window.clearTimeout(timer);
        pendingTimers.delete(element);
    }
}

function runAfterAnimation(element: HTMLElement, duration: number, callback: () => void): void {
    cancelPendingAnimation(element);
    const timer = window.setTimeout(() => {
        pendingTimers.delete(element);
        callback();
    }, duration + ANIMATION_GRACE_MS);
    pendingTimers.set(element, timer);
}

function buildTransition(animateSize: boolean, animateOpacity: boolean, duration: number): string {
    const parts: string[] = [];
    if (animateSize) {
        parts.push(`height ${duration}ms ease`, `padding ${duration}ms ease`);
    }
    if (animateOpacity) {
        parts.push(`opacity ${duration}ms ease`);
    }
    return parts.join(", ");
}

function usesSizeAnimation(animation: AnimationKind): boolean {
    return animation === "slide" || animation === "fadeSlide";
}

function usesOpacityAnimation(animation: AnimationKind): boolean {
    return animation === "fade" || animation === "fadeSlide";
}

/**
 * Hides the element. The inline `!important` is needed because layouts and themes often force a
 * `display` on cells (for example `display: block !important` on a `td`), which would otherwise
 * simply ignore a plain `display: none`.
 */
function hideElement(target: HTMLElement, options: ToggleOptions): void {
    target.dataset[PREVIOUS_DISPLAY_KEY] = target.style.getPropertyValue("display");
    target.dataset[PREVIOUS_PRIORITY_KEY] = target.style.getPropertyPriority("display");

    if (!animationEnabled(options)) {
        cancelPendingAnimation(target);
        restoreStyles(target);
        target.style.setProperty("display", "none", "important");
        return;
    }

    const animateSize = usesSizeAnimation(options.animation);
    const animateOpacity = usesOpacityAnimation(options.animation);
    const computed = window.getComputedStyle(target);
    const naturalHeight = target.offsetHeight;
    const naturalPaddingTop = computed.paddingTop;
    const naturalPaddingBottom = computed.paddingBottom;

    snapshotStyles(target);
    target.style.transition = buildTransition(animateSize, animateOpacity, options.duration);
    if (animateSize) {
        target.style.overflow = "hidden";
        target.style.height = `${naturalHeight}px`;
        target.style.paddingTop = naturalPaddingTop;
        target.style.paddingBottom = naturalPaddingBottom;
    }
    if (animateOpacity) {
        target.style.opacity = "1";
    }

    // Force the browser to apply the starting values before switching to the end values.
    void target.offsetHeight;

    if (animateSize) {
        target.style.height = "0px";
        target.style.paddingTop = "0px";
        target.style.paddingBottom = "0px";
    }
    if (animateOpacity) {
        target.style.opacity = "0";
    }

    runAfterAnimation(target, options.duration, () => {
        target.style.setProperty("display", "none", "important");
        restoreStyles(target);
    });
}

/** Restores the display value the element had before it was hidden and animates it back in. */
function showElement(target: HTMLElement, options: ToggleOptions): void {
    const previousDisplay = target.dataset[PREVIOUS_DISPLAY_KEY];
    const previousPriority = target.dataset[PREVIOUS_PRIORITY_KEY];
    delete target.dataset[PREVIOUS_DISPLAY_KEY];
    delete target.dataset[PREVIOUS_PRIORITY_KEY];

    target.style.removeProperty("display");
    if (previousDisplay) {
        target.style.setProperty("display", previousDisplay, previousPriority ?? "");
    }

    if (isHidden(target) || !animationEnabled(options)) {
        cancelPendingAnimation(target);
        restoreStyles(target);
        if (isHidden(target)) {
            // The element is hidden through a style sheet, so fall back to its default display value.
            target.style.setProperty("display", "revert", "important");
        }
        return;
    }

    const animateSize = usesSizeAnimation(options.animation);
    const animateOpacity = usesOpacityAnimation(options.animation);
    const computed = window.getComputedStyle(target);
    const naturalHeight = target.offsetHeight;
    const naturalPaddingTop = computed.paddingTop;
    const naturalPaddingBottom = computed.paddingBottom;

    snapshotStyles(target);
    target.style.transition = buildTransition(animateSize, animateOpacity, options.duration);
    if (animateSize) {
        target.style.overflow = "hidden";
        target.style.height = "0px";
        target.style.paddingTop = "0px";
        target.style.paddingBottom = "0px";
    }
    if (animateOpacity) {
        target.style.opacity = "0";
    }

    void target.offsetHeight;

    if (animateSize) {
        target.style.height = `${naturalHeight}px`;
        target.style.paddingTop = naturalPaddingTop;
        target.style.paddingBottom = naturalPaddingBottom;
    }
    if (animateOpacity) {
        target.style.opacity = "1";
    }

    runAfterAnimation(target, options.duration, () => restoreStyles(target));
}

/** Hides the element, or shows it again when it is already hidden. Returns the new visibility. */
function toggleElement(target: HTMLElement, options: ToggleOptions): boolean {
    if (isHidden(target)) {
        showElement(target, options);
        return true;
    }

    hideElement(target, options);
    return false;
}

export function ToggleClass(props: ToggleClassContainerProps): ReactElement {
    const {
        buttonCaption,
        captionWhenVisible,
        targetSelector,
        // The defaults are repeated here so the widget also works on pages that were configured
        // before these properties existed.
        targetMode = "nextCell",
        nextCellFallback = true,
        initiallyHidden = true,
        animation = "slide",
        animationDuration = 300,
        icon,
        iconWhenVisible,
        iconPosition = "left",
        bootstrapStyle,
        onClickAction,
        style,
        tabIndex
    } = props;

    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const activeTarget = useRef<HTMLElement | null>(null);
    const [targetVisible, setTargetVisible] = useState(!initiallyHidden);

    // Content that broke out of its cell goes back into it when the widget leaves the page.
    useEffect(
        () => () => {
            if (activeTarget.current) {
                endBreakout(activeTarget.current);
            }
        },
        []
    );

    /**
     * Collapses the target while the page is still being painted, so the content never flashes on
     * screen before it is hidden. The layout is prepared in the same pass, so content in the
     * widget's own cell is out of it before it is ever shown.
     */
    useLayoutEffect(() => {
        let frame = 0;
        let handle = 0;

        const attempt = (): void => {
            const button = buttonRef.current;
            const target = button ? prepareTarget(button, targetSelector, targetMode, nextCellFallback) : null;

            if (!target) {
                frame += 1;
                if (frame <= INITIAL_LOOKUP_FRAMES) {
                    handle = window.requestAnimationFrame(attempt);
                }
                return;
            }

            activeTarget.current = target.element;
            if (initiallyHidden) {
                if (!isHidden(target.element)) {
                    hideElement(target.element, { animation: "none", duration: 0 });
                }
                setTargetVisible(false);
            }
        };

        attempt();

        return () => {
            if (handle) {
                window.cancelAnimationFrame(handle);
            }
        };
    }, [initiallyHidden, targetSelector, targetMode, nextCellFallback]);

    const onClickHandler = useCallback(
        (button: HTMLButtonElement) => {
            const target = prepareTarget(button, targetSelector, targetMode, nextCellFallback);
            if (target) {
                activeTarget.current = target.element;
                const options = { animation, duration: animationDuration > 0 ? animationDuration : 0 };
                const visible = toggleElement(target.element, options);
                if (!visible && target.layout === "breakout") {
                    endBreakoutAfterAnimation(target.element, options.duration);
                }
                setTargetVisible(visible);
            }

            if (onClickAction && onClickAction.canExecute) {
                onClickAction.execute();
            }
        },
        [animation, animationDuration, onClickAction, targetSelector, targetMode, nextCellFallback]
    );

    // The caption describes what the button does: "show" while the content is hidden and "hide"
    // while the content is visible. Without a second caption the first one is kept.
    const caption = targetVisible ? captionWhenVisible || buttonCaption : buttonCaption;

    // The icon does the same, for example a chevron pointing right while collapsed and down while
    // expanded. Without a second icon the first one is used in both states.
    const currentIcon = targetVisible ? iconWhenVisible?.value ?? icon?.value : icon?.value;

    return (
        <ToggleButton
            caption={caption}
            icon={currentIcon ? <Icon icon={currentIcon} altText="" /> : null}
            iconPosition={iconPosition}
            bootstrapStyle={bootstrapStyle}
            className={props.class}
            style={style}
            tabIndex={tabIndex}
            getRef={node => {
                buttonRef.current = node;
            }}
            onClickAction={onClickHandler}
        />
    );
}
