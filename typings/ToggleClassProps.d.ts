/**
 * This file was generated from ToggleClass.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { ActionValue, DynamicValue, WebIcon } from "mendix";
import { CSSProperties } from "react";

export type BootstrapStyleEnum = "default" | "primary" | "success" | "info" | "inverse" | "warning" | "danger";

export type IconPositionEnum = "left" | "right";

export type AnimationEnum = "none" | "fade" | "slide" | "fadeSlide";

export interface ToggleClassContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    buttonCaption: string;
    captionWhenVisible: string;
    targetSelector: string;
    nextCellFallback: boolean;
    initiallyHidden: boolean;
    bootstrapStyle: BootstrapStyleEnum;
    icon?: DynamicValue<WebIcon>;
    iconWhenVisible?: DynamicValue<WebIcon>;
    iconPosition: IconPositionEnum;
    animation: AnimationEnum;
    animationDuration: number;
    onClickAction?: ActionValue;
}

export interface ToggleClassPreviewProps {
    /**
     * @deprecated Deprecated since version 9.18.0. Please use class property instead.
     */
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    renderMode: "design" | "xray" | "structure";
    translate: (text: string) => string;
    buttonCaption: string;
    captionWhenVisible: string;
    targetSelector: string;
    nextCellFallback: boolean;
    initiallyHidden: boolean;
    bootstrapStyle: BootstrapStyleEnum;
    icon:
        | { type: "glyph"; iconClass: string }
        | { type: "image"; imageUrl: string; iconUrl: string }
        | { type: "icon"; iconClass: string }
        | undefined;
    iconWhenVisible:
        | { type: "glyph"; iconClass: string }
        | { type: "image"; imageUrl: string; iconUrl: string }
        | { type: "icon"; iconClass: string }
        | undefined;
    iconPosition: IconPositionEnum;
    animation: AnimationEnum;
    animationDuration: number | null;
    onClickAction: {} | null;
}
