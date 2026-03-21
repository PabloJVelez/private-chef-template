# v0 Prompt — Behind the Sauté Marketing Website

Copy everything below the line and paste it into v0.app.

---

You are v0.app. Generate a modern, single-page marketing website (responsive, mobile-first) for a product named **"Behind the Sauté"**.

## Tech & Design Stack

- Next.js App Router + Tailwind CSS + shadcn/ui components
- Lucide icons throughout
- Framer Motion for section fade-ins (staggered on scroll) and hover micro-interactions
- Fonts: **Playfair Display** for headings, **Inter** for body text
- Color palette:
  - Background: `#FAFAF8` (warm white)
  - Primary text: `#1A1A1A`
  - Secondary text: `#6B6B6B`
  - Accent (copper): `#C67D4A`
  - Accent hover: `#B06A3A`
  - Warm brown: `#8B6F47`
  - Card/surface: `#F5F0EB`
  - Border/divider: `#E8E0D8`
- Brand vibe: premium, warm, culinary, professional, elegant — not overly corporate. Think high-end restaurant menu meets modern SaaS.

## Audience

Solo private chefs and small private chef businesses who currently manage inquiries through DMs, email chains, and PDF menus.

## CTAs

- **Primary:** "Book a Demo" → opens `https://calendly.com/behind-the-saute/demo` in a new tab
- **Secondary:** "Email Us" → `mailto:pmltechpile@gmail.com`

---

## Site Structure (single-page, scroll sections + sticky header)

### 1. Sticky Header

- Logo text: "Behind the Sauté" (Playfair Display, copper accent on "Sauté")
- Nav links: How It Works, Features, Pricing, FAQ
- CTA button: "Book a Demo" (copper background, white text, rounded)
- On mobile: hamburger menu with slide-out drawer; persistent floating "Book a Demo" button fixed to bottom of viewport

### 2. Hero Section

- **Headline:** "Turn chef inquiries into paid bookings — without the back-and-forth."
- **Subheadline:** "Your own branded storefront where clients browse menus, request events, and pay per seat. You just approve."
- **Primary button:** "Book a Demo" (copper, large)
- **Secondary button:** "See How It Works" (outline style, scrolls to How It Works section)
- **Trust indicators** (horizontal row of small badges with Lucide icons):
  - "Built for private chefs"
  - "Stripe payments"
  - "Done-for-you setup"
  - "Live in 48 hours"
- Background: subtle warm gradient or a large placeholder area for a hero image (label it `[Chef plating a dish — hero image]`)

### 3. How It Works (4 steps)

Section heading: "How It Works"
Subheading: "From inquiry to paid booking in four simple steps."

Layout: horizontal step cards on desktop (1 → 2 → 3 → 4 with connecting lines or arrows), vertical stack on mobile. Each step has a number badge, icon, title, and short description.

- **Step 1 — Browse**
  - Icon: `UtensilsCrossed`
  - Title: "Clients browse your menus & experiences"
  - Description: "Your storefront showcases your full menu catalog — courses, dishes, pricing — plus experience types like plated dinners, cooking classes, and buffets. No more PDF attachments."

- **Step 2 — Request**
  - Icon: `CalendarCheck`
  - Title: "They submit one structured request"
  - Description: "Date, time, party size, location, dietary needs, special requests — everything captured in a single guided form. No more back-and-forth DMs."

- **Step 3 — Approve**
  - Icon: `CheckCircle`
  - Title: "You review and approve from your dashboard"
  - Description: "See every request in your admin panel. Accept with one click or decline with a reason. You stay in full control of your calendar."

- **Step 4 — Get Paid**
  - Icon: `CreditCard`
  - Title: "Guests pay per seat via a shareable link"
  - Description: "Approved events auto-generate a bookable product. Share the link with the host — they can pay for everyone, or each guest pays for their own seat."

### 4. Features Grid

Section heading: "Everything you need to run your business"
Subheading: "Less admin. More cooking."

Layout: 2-column grid on mobile, 3-column on tablet, 4-column on desktop. Each card has an icon, title, and 1–2 line description. Cards have `#F5F0EB` background with subtle border, slight lift on hover.

1. **Branded Storefront**
   - Icon: `Store`
   - "Your own website with your name, bio, photos, and branding. SEO-ready so clients find you on Google."

2. **Full Menu Catalog**
   - Icon: `BookOpen`
   - "Organize menus by course with dishes, ingredients, and pricing. Clients browse — not download a PDF."

3. **Three Experience Types**
   - Icon: `ChefHat`
   - "Plated dinners, cooking classes, and buffet-style events — each with its own pricing and structure."

4. **Structured Request Form**
   - Icon: `ClipboardList`
   - "One multi-step form captures date, time, party size, address, dietary needs, and special requests."

5. **Admin Approvals**
   - Icon: `ShieldCheck`
   - "Accept or decline every request from your dashboard. Add chef notes or a rejection reason."

6. **Per-Seat Ticketed Checkout**
   - Icon: `Ticket`
   - "Approved events become bookable products. Inventory equals party size. Guests pay per seat."

7. **Shareable Booking Links**
   - Icon: `Share2`
   - "Share your event link via text, email, Facebook, or Twitter. Hosts or guests can each pay individually."

8. **Stripe Payments & Payouts**
   - Icon: `Wallet`
   - "Secure Stripe checkout. Optional Stripe Connect for direct payouts to your bank account."

9. **Automated Email Notifications**
   - Icon: `Mail`
   - "Clients get instant confirmations, acceptance emails with booking links, or polite decline notices. Powered by Resend."

10. **Done-for-You Setup**
    - Icon: `Wrench`
    - "We build your storefront, upload your menus, and configure your admin. You provide content — we handle the rest."

### 5. Why Chefs Love It (Pain → Solution)

Section heading: "Built for how private chefs actually work"

Layout: 3 cards, each with a "before" pain point (with a subtle red/muted icon) and an "after" solution (with a copper/green icon). Use a two-tone card design.

- **Card 1**
  - Pain: "You're copy-pasting menus into DMs and losing track of inquiries"
  - Solution: "Clients browse your full menu catalog with courses, dishes, and pricing — then submit one clean request."

- **Card 2**
  - Pain: "You spend hours going back and forth on dates, sizes, and dietary needs"
  - Solution: "One structured form captures everything upfront. You review a complete request, not a thread of messages."

- **Card 3**
  - Pain: "You chase deposits and lose bookings to no-shows"
  - Solution: "Approved events auto-generate a pay link. Guests pay per seat before the event — not after."

### 6. Pricing Section

Section heading: "Simple, transparent pricing"
Subheading: "No hidden fees. Cancel anytime."

Layout: 2 pricing cards side by side (centered), with a subtle highlight/border on the recommended tier.

- **Tier A: Launch — $99/mo**
  - "Perfect for solo chefs getting started"
  - Includes:
    - Branded storefront
    - Menu & experience pages
    - Request form + admin dashboard
    - Automated email notifications
    - Stripe checkout
    - Done-for-you setup
  - Small note: "+ per-booking commission (agreed per chef)"
  - CTA button: "Book a Demo"

- **Tier B: Growth — $149/mo**
  - "For chefs scaling to more events"
  - Everything in Launch, plus:
    - Stripe Connect direct payouts
    - Custom domain
    - Priority support
    - Lower commission rate
  - Small note: "+ per-booking commission (agreed per chef)"
  - CTA button: "Book a Demo"
  - Badge: "Most Popular" (copper badge)

Below both cards, a centered line:
> "Exact commission structure is agreed individually per chef. White-glove setup included in all plans."

### 7. Early Access / Social Proof Section

Section heading: "Built for chefs like you"
Subheading: "Here's who we're building this for."

Layout: 3 persona cards with placeholder avatars (use Lucide `User` icon in a circle as avatar).

- **Card 1**
  - Name: "The Solo Chef"
  - Description: "You do 3–8 events a month, manage everything yourself, and lose leads in your inbox. You need a system, not more apps."

- **Card 2**
  - Name: "The Growing Operation"
  - Description: "You're booking 10–20 events a month and need to stop being the bottleneck. You want clients to self-serve and pay upfront."

- **Card 3**
  - Name: "The Chef Collective"
  - Description: "You run a small team of chefs and need each one to have their own branded page while you manage operations centrally."

Below cards, a centered CTA:
> "Join the early access waitlist" → "Book a Demo" button

### 8. FAQ Section

Section heading: "Frequently Asked Questions"

Use an accordion (shadcn/ui Accordion component). Each item expands on click.

1. **"Do I still control which events I accept?"**
   "Absolutely. Every request goes to your admin dashboard. You review the details — date, party size, menu, location — and accept or decline with one click. Nothing gets booked without your approval."

2. **"How do guests pay per seat?"**
   "When you accept a request, the system auto-creates a bookable product where inventory equals the party size. You share the link with the host, and they can either pay for all seats or forward the link so each guest pays individually."

3. **"Do you support deposits?"**
   "Yes. For larger parties, the system supports partial deposits with a deadline for the remaining balance. For smaller events, full payment is collected upfront. The exact rules are configurable per chef."

4. **"What payment processor do you use?"**
   "All payments are processed securely through Stripe. Optionally, you can enable Stripe Connect so payouts go directly to your bank account."

5. **"Can I customize my menus and experiences?"**
   "Yes. You get a full menu management system — organize by course, add dishes with ingredients and descriptions, set pricing, and upload photos. You can offer plated dinners, cooking classes, buffets, or any combination."

6. **"What if I already have a website?"**
   "Behind the Sauté works as your booking and storefront system. You can link to it from your existing site, or use it as your primary web presence with a custom domain."

7. **"How long does setup take?"**
   "Most chefs are live within 48 hours. We handle the technical setup — you just provide your menus, photos, and branding preferences."

8. **"Do I need any technical skills?"**
   "None. We do the setup for you. Your day-to-day is reviewing requests and clicking approve — that's it."

### 9. Final CTA Band

Full-width section with warm gradient background (`#F5F0EB` to `#FAFAF8`).

- **Headline:** "Ready to stop chasing leads and start getting paid?"
- **Subheadline:** "Book a 15-minute demo and we'll show you how it works for your business."
- **Primary button:** "Book a Demo" (large, copper)
- **Secondary button:** "Email Us at pmltechpile@gmail.com" (outline style, `mailto:` link)

### 10. Footer

Dark background (`#1A1A1A`), light text.

- Left: "Behind the Sauté" logo text + "© 2025 Behind the Sauté. All rights reserved."
- Center: Links — Privacy Policy, Terms of Service, Refund Policy (all `href="#"` placeholders)
- Right: Contact — pmltechpile@gmail.com
- Below: small text "Built with love for private chefs everywhere."

---

## SEO & Meta

```html
<title>Behind the Sauté — Branded Storefronts & Booking for Private Chefs</title>
<meta name="description" content="Turn chef inquiries into paid bookings. Give your clients a real storefront with menus, experiences, and per-seat checkout. Built for private chefs." />
<meta property="og:title" content="Behind the Sauté — Booking & Payments for Private Chefs" />
<meta property="og:description" content="Your own branded storefront where clients browse menus, request events, and pay per seat. You just approve." />
<meta property="og:image" content="[og-image-placeholder.jpg]" />
<meta property="og:url" content="https://behindthesaute.com" />
<meta name="twitter:card" content="summary_large_image" />
```

## Design Requirements

- Generous whitespace between sections (minimum `py-24` on desktop, `py-16` on mobile)
- Framer Motion `fadeInUp` animation on each section as it scrolls into view (use intersection observer)
- Hover states on all interactive elements: buttons scale slightly (`scale-105`), cards lift with subtle shadow
- Smooth scroll behavior for all anchor links
- Mobile: full-width sections, single-column layouts, bottom-fixed "Book a Demo" button with `z-50`
- All placeholder image areas should be labeled clearly (e.g., `[Chef plating a dish — hero image]`) and use a warm neutral background with a Lucide icon centered

## Output

Generate the full single-page site as clean, well-structured React components using shadcn/ui, Tailwind CSS, and Framer Motion. Use sensible component splitting (Header, Hero, HowItWorks, Features, WhyChefsLoveIt, Pricing, SocialProof, FAQ, FinalCTA, Footer).
