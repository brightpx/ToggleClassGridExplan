import { ReactElement } from "react";
import classNames from "classnames";

import { parseInlineStyle } from "@mendix/pluggable-widgets-tools";

import { ToggleButton, ToggleButtonProps } from "./components/ToggleButton";
import { ToggleClassPreviewProps } from "../typings/ToggleClassProps";

type PreviewIcon = ToggleClassPreviewProps["icon"];

/**
 * Renders a preview icon value the same way the Mendix runtime renders it: glyph and icon values
 * become a styled `span`, image values become an `img`.
 */
function PreviewIconElement({ icon }: { icon: PreviewIcon }): ReactElement | null {
    if (!icon) {
        return null;
    }

    if (icon.type === "image") {
        return <img className="widget-toggleclass-icon-image" src={icon.imageUrl || icon.iconUrl} alt="" />;
    }

    return (
        <span
            className={
                icon.type === "glyph" ? classNames("mx-icon-fallback", "glyphicon", icon.iconClass) : icon.iconClass
            }
        />
    );
}

/** Uses the Studio Pro translation for a label, the label itself is written as readable English. */
function translate(props: ToggleClassPreviewProps, text: string): string {
    try {
        return typeof props.translate === "function" ? props.translate(text) : text;
    } catch {
        return text;
    }
}

/**
 * The caption the end-user sees on the page for the configured start state: the "hidden" caption
 * while the content is collapsed and the "shown" caption while it is expanded.
 */
function previewCaption(props: ToggleClassPreviewProps): string {
    const collapsed = props.initiallyHidden !== false;
    const caption = collapsed ? props.buttonCaption : props.captionWhenVisible || props.buttonCaption;

    return (caption ?? "").trim() || "Expand";
}

/** Human readable description of what the button shows / hides, used for the tooltip and x-ray hint. */
function previewTarget(props: ToggleClassPreviewProps): string {
    const selector = (props.targetSelector ?? "").trim();
    if (selector) {
        return selector;
    }

    return props.targetMode === "nearest"
        ? translate(props, "Hides the nearest element")
        : translate(props, "Hides the next cell (td)");
}

function transformProps(props: ToggleClassPreviewProps): ToggleButtonProps {
    // The preview shows the same state the end-user gets on the page, so the icon follows the
    // configured start state and falls back to the first icon when no second one is set.
    const collapsed = props.initiallyHidden !== false;
    const currentIcon = collapsed ? props.icon : props.iconWhenVisible ?? props.icon;

    return {
        caption: previewCaption(props),
        icon: currentIcon ? <PreviewIconElement icon={currentIcon} /> : null,
        iconPosition: props.iconPosition ?? "left",
        bootstrapStyle: props.bootstrapStyle,
        className: props.className,
        style: parseInlineStyle(props.style),
        title: previewTarget(props)
    };
}

/**
 * Design mode preview: one single button, exactly as it will look in the running app, so the page
 * keeps its layout. The tooltip names what will be toggled, so the modeler can still see the target
 * without any extra element being drawn next to the button.
 *
 * X-ray mode shows the same single button - the widget renders nothing but a button on the page, so
 * the preview does not add a target hint either. Structure mode is rendered by `getPreview` in
 * `ToggleClass.editorConfig.ts`.
 */
export function preview(props: ToggleClassPreviewProps): ReactElement {
    return <ToggleButton {...transformProps(props)}></ToggleButton>;
}

/**
 * The CSS of `ToggleClass.css` as a string. Depending on the bundler the imported stylesheet is a
 * plain string or a module namespace wrapping it, so both shapes are handled.
 */
function widgetCss(): string {
    const css: unknown = require("./ui/ToggleClass.css");

    if (typeof css === "string") {
        return css;
    }

    const namespace = css as { default?: unknown; stylesheet?: unknown } | null | undefined;
    if (typeof namespace?.default === "string") {
        return namespace.default;
    }
    if (typeof namespace?.stylesheet === "string") {
        return namespace.stylesheet;
    }

    return "";
}

export function getPreviewCss(): string {
    return widgetCss();
}
