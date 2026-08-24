# Ramnagar Eats — UI Enhancement Backlog

## Cultural & Traditional Design Overhaul

### Priority 1: Typography & Fonts
- [ ] Replace DM Sans with a culturally appropriate font pairing (e.g., **Poppins** for headings + **Nunito** for body — clean, modern, Indian-market friendly)
- [ ] Add Hindi/Devanagari support with fallback fonts (Noto Sans Devanagari)
- [ ] Use decorative serif font for hero text (Georgia/Playfair Display) to evoke traditional Indian restaurant menus

### Priority 2: Color Palette — Warm Indian Tones
- [ ] Primary: Saffron Orange (`#E8663C`) — evoke spice markets
- [ ] Secondary: Deep Turmeric Gold (`#D4A843`) — traditional festive colour
- [ ] Accent: Chili Red (`#C23D2B`) — energy and warmth
- [ ] Background: Warm Cream (`#FFF8EE`) — like a thali plate
- [ ] Text: Deep Maroon (`#3B1106`) — rich, earthy, readable
- [ ] Success Green: Haldi Gold-Green (`#4A7C2E`)
- [ ] Update CSS variables across all 3 apps to match

### Priority 3: Login Page Cultural Touch
- [ ] Replace generic food emojis on customer login with hand-drawn style illustrations (rangoli patterns, paisley borders)
- [ ] Add subtle mandala pattern background to login panels
- [ ] Use Diya (oil lamp) or lotus motif as brand accent
- [ ] Traditional border patterns (paisley / block-print inspired) on form cards
- [ ] Replace generic perks icons with Indian food-specific icons (thali, handi, tandoor)

### Priority 4: Brand Identity
- [ ] Design a proper logo mark (not just 🍛 emoji) — stylized handi/pot illustration
- [ ] Consistent brand gradient across all 3 apps
- [ ] Add tagline: "रामनगर का अपना खाना" (Ramnagar's own food) as secondary text
- [ ] Footer credits: "Made with ❤️ in Jammu"

### Priority 5: Card & Component Styling
- [ ] Rounded corners → slightly more organic shapes (inspired by hand-thrown pottery)
- [ ] Card shadows → warm-toned (orange/brown tinted) instead of grey
- [ ] Button hover states → subtle warm glow effect
- [ ] Restaurant cards → add thin decorative border (block-print inspired)
- [ ] Price tags → use ₹ symbol with traditional rupee styling

### Priority 6: Animations & Micro-interactions
- [ ] Page transitions → smooth slide with warm fade
- [ ] Card hover → gentle lift with warm shadow bloom
- [ ] Cart badge → subtle bounce on update
- [ ] Order status → animated progress with traditional step icons
- [ ] Loading states → spinning handi/chulha animation

### Priority 7: Responsive & Mobile-First
- [ ] Login page → stacked layout on mobile with full-bleed cultural banner
- [ ] Restaurant grid → 2-column on tablet, 1-column on mobile
- [ ] Navigation → bottom tab bar with culturally styled icons
- [ ] Cart drawer → bottom sheet (native mobile feel)
- [ ] Touch targets → minimum 48px for all interactive elements

### Priority 8: Remove Duplicate Code Across Apps
- [ ] Extract shared `GoogleIcon` component to `shared/components/`
- [ ] Extract shared OTP flow logic into `useOtpAuth` hook in shared package
- [ ] Extract shared `FoodSpinner` component
- [ ] Extract shared `NotificationPrompt` component
- [ ] Share CSS custom properties via `shared/design-tokens.css`
- [ ] Extract shared auth page layout into `shared/components/AuthPage`

### Priority 9: Accessibility & UX Polish
- [ ] Add `aria-label` to all interactive elements
- [ ] Ensure colour contrast meets WCAG AA (4.5:1 minimum)
- [ ] Add skip-to-content link
- [ ] Keyboard navigation for all menus and modals
- [ ] Screen reader announcements for order status changes
- [ ] Focus management in OTP flow (auto-focus next input)

### Priority 10: Design System Consistency
- [ ] Create shared design tokens file with all spacing, colors, fonts
- [ ] Shared button component library (primary, secondary, ghost, danger)
- [ ] Shared form field components with consistent styling
- [ ] Shared toast/notification component
- [ ] Shared card component with standard padding and border radius

---

## Implementation Notes

### Current State
- All 3 apps use DM Sans font
- CSS variables defined in `:root` but slightly inconsistent across apps
- Login pages have different layouts (customer: split, restaurant: split, rider: single column)
- Each app has its own GoogleIcon, FoodSpinner, NotificationPrompt (duplicated)

### Design Philosophy
- **Warm, not cold** — Indian food is about warmth, so the UI should feel inviting
- **Traditional, not outdated** — Use Indian design motifs but keep the interface modern
- **Clean, not cluttered** — Generous whitespace, clear hierarchy
- **Mobile-first** — Most users will be on phones
