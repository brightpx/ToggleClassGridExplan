import { CSSProperties, MouseEvent, ReactElement, ReactNode, useCallback } from "react";
import classNames from "classnames";

import type { BootstrapStyleEnum } from "../../typings/ToggleClassProps";

export interface ToggleButtonProps {
    caption: string;
    /**
     * The icon of the current state. It is passed in as an element so the running app can use the
     * Mendix `Icon` component while the Studio Pro preview can render its own preview value.
     */
    icon?: ReactNode;
    iconPosition?: "left" | "right";
    className?: string;
    style?: CSSProperties;
    tabIndex?: number;
    title?: string;
    bootstrapStyle?: BootstrapStyleEnum;
    onClickAction?: (button: HTMLButtonElement) => void;
    getRef?: (node: HTMLButtonElement | null) => void;
}

/**
 * Renders the widget as a regular Mendix button (`mx-button btn btn-*`) so it picks up the
 * styling of the Mendix theme.
 */
export function ToggleButton(props: ToggleButtonProps): ReactElement {
    const {
        caption,
        icon,
        iconPosition = "left",
        className,
        style,
        tabIndex,
        title,
        bootstrapStyle = "default",
        onClickAction,
        getRef
    } = props;

    const handleClick = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            onClickAction?.(event.currentTarget);
        },
        [onClickAction]
    );

    const iconElement = icon ? (
        <span className="widget-toggleclass-icon" aria-hidden="true">
            {icon}
        </span>
    ) : null;

    return (
        <button
            type="button"
            className={classNames(
                "mx-button",
                "btn",
                `btn-${bootstrapStyle}`,
                "widget-toggleclass",
                icon ? `widget-toggleclass-icon-${iconPosition}` : undefined,
                className
            )}
            onClick={handleClick}
            ref={getRef}
            style={style}
            tabIndex={tabIndex}
            title={title}
        >
            {iconPosition === "left" ? iconElement : null}
            <span className="widget-toggleclass-caption" tabIndex={-1}>
                {caption}
            </span>
            {iconPosition === "right" ? iconElement : null}
        </button>
    );
}
