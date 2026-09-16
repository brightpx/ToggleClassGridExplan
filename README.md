## ToggleClass
A button (`mx-button btn btn-*`) that shows / hides the element below it by toggling `display: none`.

## Features
- Renders a real Mendix button, so it picks up the theme styling (`btn-default`, `btn-primary`, …).
- The content starts hidden when the page loads (**Start hidden**, on by default).
- Two captions: one for the collapsed state (*Caption when hidden*, for example `แสดงรายละเอียด`) and one
  for the expanded state (*Caption when shown*, for example `ซ่อนรายละเอียด`).
- Expand / collapse animation: `None`, `Fade`, `Slide` or `Fade and slide`, with a configurable duration.
  The animation is skipped automatically when the user prefers reduced motion.
- On click it hides the element that sits directly below the widget; clicking again restores the
  `display` value the element had before.
- The hide uses an inline `display: none !important`, so it also works on elements whose `display` is
  forced by the theme / layout (for example a `td` that is styled with `display: block !important`).
- Mendix / layout wrapper elements around the widget are skipped automatically, so the target is the
  first element below the widget, wherever it is dropped.
- Optionally point the widget to a specific element with a CSS selector. The cell the widget lives in
  and the cell next to it are searched first, so a `td` right after the button is found in any grid.
- The hide always removes the whole cell (`td`) the matched element lives in when that element is the
  only content of its cell, so no empty padding or borders are left behind. When the matched element
  shares its cell with other content, only the element itself is hidden and the cell stays visible.
- A class list without dots is accepted as well: `mx-name-container30 lv2-content` is tried as
  `.mx-name-container30.lv2-content`. Note that Mendix adds a `widget` suffix to custom classes in the
  DOM (`lv2-content` becomes `lv2-contentwidget`), so a single class such as `mx-name-container30`
  is the safest selector.
- **Full row fallback** (on by default): content that would be squeezed into the narrow column of
  the button is given the full width of the row instead, with **the button keeping its own column**.
  Two situations are covered:
  - Content that lives in the **same cell as the button** (how a grid row usually keeps the detail of
    a row next to the button) is taken out of that cell and dropped **below the row**, spanning the
    whole row. The row gets the `widget-toggleclass-row` class and reserves the height of the content
    with a `padding-bottom`; the content gets `widget-toggleclass-row-content`. A `ResizeObserver`
    keeps the reserved height in sync with the content while it is open.
  - When there is **nothing under the button in its own cell**, the first cell next to the widget that
    actually holds content is used instead (empty spacer cells are skipped) and gets the
    `widget-toggleclass-full-row` class, which makes that cell span the row and wrap below it.

  Both classes are plain CSS, so a page or a theme can restyle or disable them. Turn the option off to
  keep the layout exactly as the theme laid it out.
- **Brings its own CSS**: the datagrid layout the widget needs (an equal-width `flex` row instead of
  the fixed CSS grid of the datagrid, the hidden Level 2 header, the `table-bordered-*` borders, the
  button cell width, the `.lv2-contentwidget` panel with its open animation, …) ships inside the
  widget in `src/ui/ToggleClass.css` and is served from `dist/widgets.css`. It is scoped to the
  datagrid classes the widget can live in (`.last-column-new-row`, `.mx-custom-datagrid2-new`, and its
  own `.widget-toggleclass-row-content`), so no theme module has to be edited. Because the file is
  bundled into `dist/widgets.css`, a change to it needs the widget to be rebuilt **and the Mendix app
  to be restarted** (the CSS file name carries a build stamp that is written when the app starts).
- **Conditional visibility**: the widget declares the standard Mendix **Visibility** system property in
  its own **Conditional Visibility** group (General tab, like the core widgets), so the button itself can
  be shown or hidden with an expression - independent of the content it toggles.
- **Two icons, one per state**: *Icon when hidden* and *Icon when shown* (for example a chevron pointing
  right while collapsed and down while expanded). The second icon is optional; without it the first one
  is used in both states, and **Icon position** places it **Left** (default) or **Right** of the caption.
  Image, glyph and Mendix icon values are all supported.
- Studio Pro shows the widget as a **single button** in every mode: **Design mode** and **X-ray mode**
  draw the real button with the icon of the configured start state (its tooltip names what will be
  toggled), and **Structure mode** lists only the caption of the button.

## Usage
1. Drag the widget onto a page, above the content that should be expanded / collapsed.
   Place it as a sibling of that content (or in the column before it).
1. Set **Caption when hidden** (for example `แสดงรายละเอียด`) and **Caption when shown**
   (for example `ซ่อนรายละเอียด`).
1. Optionally set **Target selector** (for example `#details-panel`, `.collapsible-row` or
   `mx-name-container30`) when the element to toggle is not directly below the widget.
   Leave it empty to toggle the element below the widget.
1. Leave **Start hidden** on to show the page collapsed, or turn it off to start expanded.
1. Leave **Full row fallback** on for content that is wider than the column of the button: it then spans
   the whole row under the button (whether the content sits in the same cell as the button or in the
   next one), while the button keeps its place. Turn it off when the widget should only use what is
   directly under the button.
1. Optionally set **Icon when hidden** / **Icon when shown** and pick an **Icon position**.
1. Optionally give the button a condition with **Visibility** (General tab, **Conditional Visibility**
   group) to show or hide it per user or per data.
1. Optionally pick a **Button style**, an **Animation** with its **Animation duration** and configure an
   **On click action**.

## Demo project
[link to sandbox]

## Issues, suggestions and feature requests
[link to GitHub issues]

## Development and contribution

1. Install NPM package dependencies by using: `npm install`. If you use NPM v7.x.x, which can be checked by executing `npm -v`, execute: `npm install --legacy-peer-deps`.
1. Run `npm start` to watch for code changes. On every change:
    - the widget will be bundled;
    - the bundle will be included in a `dist` folder in the root directory of the project;
    - the bundle will be included in the `deployment` and `widgets` folder of the Mendix test project.

[specify contribution]
