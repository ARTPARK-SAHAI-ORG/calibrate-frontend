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

## Responsive Design

**Philosophy**: Mobile-first approach using Tailwind breakpoints. Always provide mobile defaults, then scale up with `md:` (768px) and `lg:` (1024px) prefixes.

### Breakpoints

- `md:` - 768px (tablet and up)
- `lg:` - 1024px (desktop and up)
- `sm:` - 640px (rarely used, only for specific visibility controls)

### Core Responsive Patterns

#### Section Padding

**Standard sections** (text-heavy):

```tsx
className = "px-4 md:px-8 lg:px-12 py-16 md:py-24";
```

**Image-heavy sections** (e.g. feature showcases):

```tsx
className = "px-6 md:px-8 lg:px-12 py-16 md:py-20";
```

- Mobile gets extra padding (`px-6` instead of `px-4`) to prevent images from feeling stuck to screen edges

#### Typography Scaling

**Headlines** (major section headings):

```tsx
className = "text-3xl md:text-4xl lg:text-5xl";
// Hero uses: text-4xl md:text-6xl
```

**Subheadings** (secondary headings):

```tsx
className = "text-2xl md:text-3xl lg:text-4xl";
```

**Body text / subtitles**:

```tsx
className = "text-base md:text-xl";
```

**Small body text**:

```tsx
className = "text-sm md:text-base";
```

**Tab pills / compact text**:

```tsx
className = "text-xs md:text-sm";
```

#### Button Sizing

**Landing page CTAs**:

```tsx
className = "px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base";
```

**Compact buttons** (header, smaller actions):

```tsx
className = "px-4 md:px-5 py-2 text-sm md:text-base";
```

#### Spacing & Gaps

**Margins**:

```tsx
mb-4 md:mb-6    // Small to medium
mb-8 md:mb-10   // Medium to large
mb-10 md:mb-16  // Large to extra-large
```

**Gaps** (flex/grid):

```tsx
gap-3 md:gap-4  // Compact spacing
gap-6 md:gap-8  // Standard spacing
```

**Vertical spacing** (stacked elements):

```tsx
space-y-3 md:space-y-4  // Between list items/cards
space-y-12              // Between major sections (mobile)
```

#### Grid Patterns

**Two-column layouts** (stack on mobile, side-by-side on desktop):

```tsx
className = "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8";
```

**Asymmetric grids** (sidebar + content):

```tsx
className = "grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 md:gap-8";
```

**Provider/Integration grids**:

```tsx
// 4 columns at all breakpoints with responsive padding/font
className = "grid grid-cols-4";
// Cell: p-3 md:p-5, text-xs md:text-sm text-center
```

### Mobile-Specific Patterns

#### Conditional Rendering

**Show only on desktop**:

```tsx
className = "hidden md:flex"; // or md:block, md:grid
```

**Show only on mobile**:

```tsx
className = "md:hidden";
```

**Hide on smallest screens**:

```tsx
className = "hidden sm:inline-block";
// Use for non-critical links like "Documentation" in header
```

#### Mobile Tab Controls

When desktop uses tabs but mobile should show all content:

```tsx
// Desktop: Tab switcher with state-controlled content
<div className="hidden md:flex">
  {/* Tab buttons */}
</div>
<div className="hidden md:grid">
  {/* Content for active tab */}
</div>

// Mobile: All content stacked
<div className="md:hidden space-y-12">
  {items.map(item => (
    <div key={item.id}>
      {/* All items rendered */}
    </div>
  ))}
</div>
```

When both mobile and desktop use tabs (different content per tab):

```tsx
// Mobile: Segmented control
<div className="md:hidden">
  <div className="inline-flex bg-gray-100 rounded-xl p-1">
    <button className="px-5 py-2.5 text-sm...">Tab 1</button>
    <button className="px-5 py-2.5 text-sm...">Tab 2</button>
  </div>
</div>

// Content with conditional visibility
<div className={getStartedTab === "other" ? "hidden md:block" : ""}>
  {/* Shows on mobile when active, always on desktop */}
</div>
```

#### Line Break Control

```tsx
<br className="hidden md:block" />
```

- Hides forced line breaks on mobile so text reflows naturally
- Use when desktop needs specific line breaks but mobile should wrap automatically

#### Horizontal Scroll Containers

For tab pills or content that might overflow on small screens:

```tsx
className = "overflow-x-auto";
// Combined with: whitespace-nowrap on items
```

### Icon Sizing

```tsx
// Standard icons
className = "w-5 h-5";

// Responsive icons (when needed)
className = "w-6 h-6 md:w-8 md:h-8";
className = "w-7 h-7 md:w-8 md:h-8";
```

### Card Padding

```tsx
// Standard cards
className = "p-5 md:p-8";

// Compact cards (Get Started section)
className = "p-4 md:p-8";

// Link cards inside sections
className = "p-3 md:p-4";
```

### Critical Rules

1. **Never use fixed large values without mobile defaults**: Don't write `px-12` or `text-5xl` alone; always provide smaller mobile value first
2. **Test at 375px width** (iPhone SE): Ensure content doesn't overflow or feel cramped
3. **Preserve desktop UI**: When adding responsive classes, verify `md:` and `lg:` values match original desktop design
4. **Use semantic breakpoints**: `md:` for tablet+, `lg:` for desktop-specific layouts (like sticky sidebars)
5. **Stack grids on mobile**: Multi-column grids should use `grid-cols-1 md:grid-cols-N` to stack on mobile
6. **Compact spacing on mobile**: Reduce padding, gaps, and margins on small screens; users expect denser layouts on phones

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

## App-Specific Responsive Patterns

### Philosophy

- **Mobile-First**: Design for mobile screens first, then progressively enhance for larger screens
- **Desktop Preservation**: All responsive changes must preserve the existing desktop UI
- **Breakpoints**: Use `md:` (768px) as the primary breakpoint, `sm:` (640px) and `lg:` (1024px) as needed
- **No MobileGuard**: The app is fully responsive; no "use a laptop" blocking messages

### AppLayout Responsive Behavior

#### Sidebar

- **Mobile**: Hidden by default, shows as full-screen overlay when opened
- **Desktop**: Visible, toggleable between collapsed and expanded states
- **Backdrop**: Semi-transparent black backdrop (`bg-black/50`) appears on mobile when sidebar is open
- **Classes**: `fixed md:relative z-40 h-full` for mobile overlay behavior

#### Header

- **Mobile**: Includes hamburger menu button to toggle sidebar
- **Desktop**: Hamburger button hidden, shows `customHeader` content
- **Padding**: `px-4 md:px-6`

#### Content Area

- **Padding**: `px-4 md:px-6 lg:px-8` for progressive spacing

### Page Container Patterns

#### Standard Container

```tsx
<div className="space-y-4 md:space-y-6 py-4 md:py-6">
```

- Vertical spacing: `4` on mobile, `6` on desktop
- Vertical padding: `4` on mobile, `6` on desktop

### Header Patterns

#### Page Header with Action Button

```tsx
<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
  <div>
    <h1 className="text-xl md:text-2xl font-semibold">Title</h1>
    <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
      Description
    </p>
  </div>
  <button className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0">
    Action
  </button>
</div>
```

- **Mobile**: Stack vertically
- **Desktop**: Horizontal layout with space-between
- **Button**: Use `flex-shrink-0` to prevent button shrinking

### Typography Scaling

#### Headings

- `h1`: `text-xl md:text-2xl` (page titles)
- `h2`: `text-lg md:text-xl` (section titles)
- `h3`: `text-base md:text-lg` (subsection titles)

#### Body Text

- Primary: `text-sm md:text-base`
- Secondary/Muted: `text-sm md:text-base text-muted-foreground`
- Small: `text-xs md:text-sm`

### Component Sizing

#### Buttons

- Height: `h-9 md:h-10`
- Text: `text-sm md:text-base`
- Icon buttons: `w-8 h-8 md:w-9 md:h-9`

#### Input Fields

- Height: `h-9 md:h-10`
- Text: `text-sm md:text-base`
- Padding: `px-3 md:px-4` for standard inputs, `pl-10` when icon present

#### Search Inputs

```tsx
<input className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
```

### Empty States & Errors

#### Standard Pattern

```tsx
<div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
    {/* Icon */}
  </div>
  <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
    Heading
  </h3>
  <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
    Message
  </p>
  {/* Buttons */}
</div>
```

- Icon size: `12×12` mobile, `14×14` desktop
- Padding: `p-8` mobile, `p-12` desktop
- Margins: `3` mobile, `4` desktop

### Table to Card Conversion

#### Desktop Table

- Hidden on mobile: `hidden md:block`
- Standard table layout with header and rows

#### Mobile Cards

```tsx
<div className="md:hidden space-y-3">
  {items.map((item) => (
    <div
      key={item.id}
      className="border border-border rounded-lg overflow-hidden bg-background"
    >
      <div className="p-4 cursor-pointer">{/* Content */}</div>
      <div className="flex items-center gap-2 px-4 pb-3 pt-0">
        {/* Action buttons */}
      </div>
    </div>
  ))}
</div>
```

- Card spacing: `space-y-3`
- Content padding: `p-4`
- Action area: `px-4 pb-3 pt-0`

### Server-paginated list bar

Use `ServerPaginatedListBar` from `@/components/ui` — do not duplicate markup. Full rules in `CLAUDE.md`.

**Placement:** directly **above** the table. Wrap bar + table in `space-y-1 pt-1`; toolbar and bulk actions sit above that group in a parent with `space-y-3`. Not below the table.

### Tabs Navigation

#### Horizontal Scrollable Tabs

```tsx
<div className="flex items-center gap-4 md:gap-6 border-b border-border overflow-x-auto">
  <button className="pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap">
    Tab Label
  </button>
</div>
```

- Gap: `4` on mobile, `6` on desktop
- Text size: `text-sm` mobile, `text-base` desktop
- Use `whitespace-nowrap` to prevent tab text wrapping
- Use `overflow-x-auto` for horizontal scrolling on mobile

### Dialog/Modal Responsive

#### Outer Container

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
```

- Add `p-4` padding on outer container for mobile spacing

#### Dialog Content

```tsx
<div className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg">
  <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Title</h2>
  {/* Content */}
  <div className="flex items-center justify-end gap-2 md:gap-3">
    <button className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium">
      Cancel
    </button>
    <button className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium">
      Confirm
    </button>
  </div>
</div>
```

- Dialog padding: `p-5` mobile, `p-6` desktop
- Title: `text-base` mobile, `text-lg` desktop
- Button gaps: `gap-2` mobile, `gap-3` desktop

### Button Layouts

#### Single Button

- Full width on mobile: `w-full sm:w-auto`

#### Multiple Buttons

```tsx
<div className="flex flex-col sm:flex-row gap-3 md:gap-4">
  <button>Button 1</button>
  <button>Button 2</button>
</div>
```

- Stack vertically on mobile
- Horizontal on small screens and up

### List Page Action Buttons

#### In Empty States

```tsx
<div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full sm:w-auto px-4 sm:px-0">
  <button className="h-9 md:h-10 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer text-sm md:text-base font-medium text-foreground">
    Action
  </button>
</div>
```

- Full width cards with side padding on mobile
- Auto width on small screens and up

### Critical Responsive Rules

1. **Always test both mobile and desktop**: Changes should not break either view
2. **Use md: breakpoint**: Primary breakpoint for switching between mobile and desktop layouts
3. **Preserve hierarchy**: Mobile should simplify, not remove critical information
4. **Card-based mobile**: Convert complex tables to cards on mobile for better touch interaction
5. **Horizontal scroll for tabs**: Use `overflow-x-auto` for tab navigation on narrow screens
6. **Flexible layouts**: Use `flex-col sm:flex-row` for stacking on mobile
7. **Progressive spacing**: Start with smaller spacing on mobile, increase on desktop
8. **Touch targets**: Minimum button height of `h-9` (36px) for mobile usability
9. **Text truncation**: Use `truncate` or `line-clamp-N` for long text on mobile
10. **Icon sizing**: Scale icons with screen size (`w-4 h-4 md:w-5 md:h-5`)

### Mobile-Specific Patterns

#### Sort Control on Mobile

```tsx
<div className="flex justify-end md:hidden mb-3">
  <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
    Sort by date
    <svg
      className={`w-4 h-4 transition-transform ${
        sortOrder === "asc" ? "rotate-180" : ""
      }`}
    >
      {/* Icon */}
    </svg>
  </button>
</div>
```

- Show sort button separately on mobile above card list
- Hide on desktop where it's in table header

#### Mobile Action Buttons in Cards

```tsx
<div className="flex items-center gap-2 px-4 pb-3 pt-0">
  <button className="flex-1 h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-foreground bg-muted/50 hover:bg-muted transition-colors">
    <svg className="w-4 h-4">{/* Icon */}</svg>
    Action
  </button>
</div>
```

- Use `flex-1` for equal width buttons
- Include icon + text for clarity
- Height `h-8` for compact mobile cards
