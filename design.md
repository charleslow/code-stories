# Design Document — “Code Stories” UI

## **1. Objectives**

**Primary goals**

* Create a **professional, elegant, and competent** aesthetic appropriate for a technical product.
* Distinguish the application visually through a **tasteful, muted pink accent** without sacrificing seriousness or readability.
* Increase clarity of hierarchy, navigation, and relationships between code and narrative.
* Establish a **coherent design system** that can scale across future screens.

**Non-goals**

* Avoid playful, decorative, or “consumer app” visual language.
* Avoid overuse of pink or highly saturated color.
* Avoid heavy shadows, glossy effects, or skeuomorphic styling.

---

## **2. Design Principles**

The UI should consistently reflect these principles:

1. **Restraint over decoration**
   Every visual element must have a functional purpose.

2. **Hierarchy by contrast, not size alone**
   Importance is communicated via weight, color, and spacing rather than extreme scaling.

3. **Surfaces, not boxes**
   Panes should feel like layered surfaces rather than hard containers.

4. **One accent, disciplined usage**
   Pink is meaningful — not decorative.

5. **Editorial quality in the narrative pane**
   The story view should feel like a high-end technical publication.

---

## **3. Color System**

### 3.1 Core Accent (Pink)

**Primary Accent (Brand Pink)**

* `#E66B8A` — cool, muted rose (primary interactive color)

**Systematic supporting shades**

* **Accent-strong:** `#E66B8A` — primary actions, active states
* **Accent-muted:** `#F3B7C5` — hover states, secondary highlights
* **Accent-surface:** `rgba(230, 107, 138, 0.08)` — tinted backgrounds, callouts
* **Accent-border:** `rgba(230, 107, 138, 0.25)` — subtle borders, dividers

### 3.2 Dark Base Palette (Surfaces)

* **App background:** `#0B0F14`
* **Primary panel:** `#111620`
* **Secondary panel:** `#0F141D`
* **Overlay / elevated surface:** `#151A24`

### 3.3 Neutral Text & UI Colors

* **Primary text:** `#E6E9ED`
* **Secondary text:** `#B0B7C1`
* **Muted text:** `#8B94A1`
* **Borders (neutral):** `rgba(255,255,255, 0.08)`

### 3.4 Accessibility Notes

* Ensure minimum contrast of **4.5:1** for body text against panel backgrounds.
* Pink should pass WCAG contrast for buttons and active states.
* Focus rings must be visible but subtle (soft pink glow, not harsh outline).

---

## **4. Design Tokens (System Foundation)**

### 4.1 Spacing Scale

Use a consistent modular scale:

* 4, 8, 12, 16, 24, 32, 48px

### 4.2 Border Radius

* **Primary radius:** 12px (panels, buttons, callouts)
* **Secondary radius:** 8px (chips, small UI elements)

### 4.3 Borders & Elevation

* Default border: **1px hairline** at low contrast
* Elevation levels:

  * Level 0: Flat surface
  * Level 1: Very subtle shadow (`0 4px 12px rgba(0,0,0,0.15)`)
  * Level 2: Rare; only for modals or overlays

---

## **5. Layout & Surface Structure**

### 5.1 Three-Pane Split View

**General layout**

* Left: Chapter sidebar
* Center: Code viewer
* Right: Narrative/story pane

**Surface treatment**

* Each pane sits on a slightly different background tone.
* **16–24px gutter** between panes instead of a single tight divider.
* Optional **draggable splitter** with:

  * Thin vertical handle (pill shape)
  * Low opacity by default; higher opacity on hover

---

## **6. Sidebar (Navigation)**

### 6.1 Structure

* Header label: “CHAPTERS” in muted uppercase microtext.
* List of chapters in a vertical stack.

### 6.2 Active State (Critical)

Active chapter receives:

* 2–3px **left pink accent bar**
* Subtle tinted background: `rgba(230,107,138,0.08)`
* Slightly heavier font weight

### 6.3 Hover State

* Very faint pink wash (`~5–8% opacity`)
* No abrupt color jumps

### 6.4 Progress Indicator

* Small “8 / 11” indicator near the top of the sidebar.
* Muted text color.

---

## **7. Buttons & Pagination Controls**

### 7.1 Primary vs Secondary

* **Next →**: Primary pink button
* **Prev ←**: Secondary neutral button (dark gray + hairline)

### 7.2 Button Specs

* Height: 36–40px
* Radius: 12px
* Icon usage: Consistent chevrons
* Hover: Slight brightness increase
* Press: 0.98 scale + darker pink

### 7.3 Bottom Control Bar

* Subtle top border
* Slight background blur or darker overlay to distinguish it from content.

---

## **8. Code Pane (Center)**

### 8.1 Typography

* Font size: 13–14px
* Line-height: ~1.55
* Monospace font (e.g., JetBrains Mono, SF Mono, or similar)

### 8.2 Syntax Theme

* Use a high-quality dark theme (e.g., One Dark, GitHub Dark, or Tokyo Night).
* Keep syntax colors cool/neutral.
* **Do NOT use pink in syntax highlighting.**

### 8.3 Header

Replace raw “Lines 1–50” with:

* File path as breadcrumb chip
* Small utility icons (copy file path, open in editor)

### 8.4 Story ↔ Code Connection

When the narrative references specific lines:

* Highlight those line ranges with a subtle tinted background.

---

## **9. Narrative / Story Pane (Right)**

### 9.1 Typography System

* **H1:** 24–28px, semibold
* **H2:** 16–18px, semibold
* **Body:** 14–15px
* **Inline code:** Slightly smaller, higher-contrast background chip

### 9.2 Layout

* Max line length: **70–80 characters**
* Line-height: **1.6**
* Consistent spacing between headings, paragraphs, and lists.

### 9.3 Callout Blocks (Replace Blue Highlights)

Instead of blue emphasis text, use styled callouts:

* Background: `rgba(230,107,138,0.08)`
* Left border: `rgba(230,107,138,0.25)`
* Title like “In the code” or “Note” in muted pink

### 9.4 Links

* Default link color: muted pink
* Hover: slightly deeper pink + subtle underline

---

## **10. Progress & Status (Generating View)**

### 10.1 Progress Bar

* Thin, refined bar in pink
* Smooth animation (not chunky or segmented unless intentionally designed)

### 10.2 Stage Indicators

* **Current stage:** solid pink dot
* **Completed:** outlined pink circle
* **Pending:** neutral gray

This visually ties progress to the brand accent.

---

## **11. Microinteractions**

* Pane transitions: 150–200ms ease-out.
* Sidebar hover and active transitions: smooth, minimal.
* Focus rings: soft pink glow, accessible.
* Button press: subtle scale reduction + color shift.
* Progress bar: gentle gradient sweep within pink family (optional).

---

## **12. What This Achieves (Design Outcomes)**

The redesigned UI should feel:

* More **intentional and polished**
* Less like a generic dark dev tool
* More like a curated technical editorial product
* Distinctive due to restrained pink branding
* Easier to read and navigate