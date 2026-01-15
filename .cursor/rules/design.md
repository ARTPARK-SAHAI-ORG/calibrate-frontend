---
description: "Design guidelines and principles for the project"
alwaysApply: true
---

## General Principles

### Cursor & Interaction

- **All interactive elements** (buttons, tabs, select dropdowns, clickable items) must have `cursor-pointer` class
- Disabled elements should use `cursor-not-allowed` with `disabled:opacity-50`
- Hover states should be smooth with `transition-colors` or `transition-opacity`

### Typography

- **Font sizes**: Use `text-[13px]` for most UI elements, `text-[14px]` for primary buttons, `text-[15px]` for headings/subheadings, `text-[12px]` for labels/secondary text, `text-[18px]` for large metric values
- **Font weights**: `font-medium` for most text, `font-semibold` for headings and primary buttons
- **Text colors**: Use semantic color tokens (`text-foreground`, `text-muted-foreground`, `text-background`)

### Spacing

- Use consistent spacing scale: `space-y-2`, `space-y-4`, `space-y-6` for vertical spacing
- Padding: `p-4` for cards/containers, `px-4 py-3` for table cells, `px-8` for primary buttons
- Gaps: `gap-2`, `gap-3`, `gap-4` for flex/grid layouts

## Component Patterns

### Buttons

#### Primary Button

```tsx
className =
  "h-11 px-8 rounded-md text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 shadow-sm";
```

- Height: `h-11`
- Padding: `px-8`
- Background: `bg-foreground` with `text-background`
- Hover: `hover:opacity-90`

#### Secondary Button

```tsx
className =
  "h-10 px-4 rounded-md text-[13px] font-medium border border-border bg-background hover:bg-accent transition-colors flex items-center gap-2 cursor-pointer";
```

- Height: `h-10`
- Border: `border border-border`
- Hover: `hover:bg-accent`

#### Icon Button

```tsx
className =
  "flex-shrink-0 w-10 h-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer";
```

- Square: `w-10 h-10`
- Centered icon with flex

#### Dashed Border Button (Add/Secondary Actions)

```tsx
className =
  "w-full h-10 px-4 rounded-md text-[13px] font-medium border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer";
```

### Tabs

```tsx
className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
  active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
}`}
```

- Active: `border-foreground text-foreground`
- Inactive: `border-transparent text-muted-foreground hover:text-foreground`
- Always include `cursor-pointer`

### Form Elements

#### Text Input

```tsx
className =
  "w-full h-10 px-3 rounded-md text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";
```

- Height: `h-10`
- Focus: `focus:ring-2 focus:ring-accent`

#### Select Dropdown

```tsx
className =
  "h-10 px-4 pr-10 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none min-w-[140px]";
```

- Custom dropdown arrow with absolute positioning
- `appearance-none` to hide default arrow
- `cursor-pointer` required

### Cards & Containers

#### Card Container

```tsx
className = "border rounded-xl p-4 bg-muted/10";
```

- Border radius: `rounded-xl`
- Background: `bg-muted/10` for subtle background

#### Table Container

```tsx
className = "border rounded-xl overflow-hidden";
```

- `overflow-hidden` to clip table borders

### Tables

#### Table Header

```tsx
className = "bg-muted/50 border-b border-border";
```

- Background: `bg-muted/50`
- Border: `border-b border-border`

#### Table Cell

```tsx
className = "px-4 py-3 text-[13px] text-foreground";
```

- Padding: `px-4 py-3`
- Font size: `text-[13px]`

#### Table Row

```tsx
className = "border-b border-border last:border-b-0";
```

- Border between rows, remove from last

### Status Indicators

#### Success Icon

```tsx
className = "w-5 h-5 text-green-500";
```

#### Error Message

```tsx
className = "text-[13px] text-red-500 flex items-center gap-2";
```

- Include emoji (❌) for visual indication

#### Loading Spinner

```tsx
className = "w-4 h-4 animate-spin"; // or w-5 h-5 for larger
```

### Metrics Display

#### Metric Card Grid

- First row: `grid grid-cols-3 gap-4` (for 3 metrics)
- Second row: `grid grid-cols-3 gap-4` (maintain 3 columns even with 2 values)
- Metric label: `text-[12px] text-muted-foreground mb-1`
- Metric value: `text-[18px] font-semibold text-foreground`

### Layout Patterns

#### Full Width Content Breakout

For content that needs to break out of parent container (`max-w-4xl`):

```tsx
className =
  "-mx-8 px-8 w-[calc(100vw-260px)] ml-[calc((260px-100vw)/2+50%)] relative";
```

- Accounts for 260px sidebar
- Breaks out of parent padding with `-mx-8 px-8`

#### Section Spacing

- Use `pt-6` for sections after borders or major separations
- Use `space-y-6` for content within sections

### Color Tokens

- `foreground` / `background`: Primary text/background colors
- `muted-foreground`: Secondary text
- `border`: Border color
- `accent`: Hover/active states
- `muted`: Subtle backgrounds (`bg-muted/10`, `bg-muted/20`, `bg-muted/50`)

### Validation States

#### Invalid Row/Input

```tsx
className = "border-red-500 bg-red-500/10";
```

- Red border with subtle red background

### Dialogs/Modals

#### Overlay

```tsx
className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50";
```

#### Dialog Container

```tsx
className =
  "bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-lg";
```

## Specific Component Details

### Evaluation Results Tabs

- Tabs should have `cursor-pointer`
- Content breaks out to full width (minus sidebar)
- Tab navigation aligned with Evaluate button padding

### Provider Selection

- Toggle buttons with checkmark icons when selected
- Selected: `bg-foreground text-background border-foreground`
- Unselected: `bg-background text-muted-foreground border-border hover:bg-accent/50`

### File Upload

- Hidden file input with custom button
- Loading state with spinner
- Success state with green checkmark icon
- File name truncation at 30 characters

### Results Tables

- Row numbers (1, 2, 3...) instead of IDs in per-provider results
- Full width tables with proper column alignment
- Alternating row styling with borders

## Accessibility

- All buttons should have appropriate `aria-label` when icon-only
- Focus states should be visible (`focus:ring-2 focus:ring-accent`)
- Disabled states should be clearly indicated

## Animation & Transitions

- Use `transition-colors` for color changes
- Use `transition-opacity` for opacity changes
- Spinner animations: `animate-spin`
- Smooth scrolling: `behavior: "smooth"` for programmatic scrolling
