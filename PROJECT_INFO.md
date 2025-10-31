# Highway Delite - Adventure Booking Platform

A beautiful, modern Next.js application for booking adventure experiences across India.

## 🎨 Features

- **Pixel-Perfect Design**: Exact recreation of the original HTML designs
- **Smooth Animations**: Custom CSS animations for enhanced UX
  - Fade-in effects
  - Slide-up transitions
  - Scale animations
  - Hover effects with smooth transitions
- **Responsive Design**: Fully responsive across all devices
- **5 Complete Pages**:
  1. **Home** (`/`) - Experience listing with grid layout
  2. **Search** (`/search`) - Search results page
  3. **Details** (`/details`) - Experience details with booking options
  4. **Checkout** (`/checkout`) - Payment and booking form
  5. **Confirmation** (`/confirmation`) - Success page with animated checkmark

## 🚀 Getting Started

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Build for Production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
highway-delite/
├── app/
│   ├── page.tsx                    # Home page (INDEX1)
│   ├── search/page.tsx             # Search results (INDEX2)
│   ├── details/page.tsx            # Experience details (INDEX3)
│   ├── checkout/page.tsx           # Checkout form (INDEX4)
│   ├── confirmation/page.tsx       # Booking confirmation (INDEX5)
│   ├── layout.tsx                  # Root layout
│   └── globals.css                 # Global styles + animations
├── components/
│   └── Header.tsx                  # Reusable header component
└── VISUALS/                        # Original HTML files
```

## 🎭 Animations

### Custom Keyframe Animations

- **fadeIn**: Smooth opacity transition
- **slideUp**: Slide from bottom with fade
- **slideDown**: Slide from top with fade
- **scaleIn**: Scale up with fade
- **pulse**: Continuous pulsing effect
- **checkmark**: Animated checkmark drawing

### Interactive Animations

- Card hover effects with lift and shadow
- Image zoom on hover
- Button press effects (scale down)
- Smooth color transitions
- Staggered card animations on page load

## 🎨 Design System

### Colors

- **Primary Yellow**: `#ffd700` (Buttons, highlights)
- **Blue Accent**: `#0095ff` (Borders, badges)
- **Dark**: `#1a1a1a` (Headers, text)
- **Gray**: `#f5f5f5` (Background)
- **Success Green**: `#28a745` (Confirmation)

### Typography

- **Font Family**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
- **Headings**: 600-700 weight
- **Body**: 400 weight

## 🔄 User Flow

1. **Home** → Browse experiences
2. **Search** → Filter by keyword (e.g., "Kayak")
3. **Details** → Select date, time, quantity
4. **Checkout** → Enter details, apply promo
5. **Confirmation** → View booking reference

## 🛠️ Technologies

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Utility-first CSS
- **Lucide React** - Icon library
- **CSS Animations** - Custom keyframe animations

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## ✨ Key Features

### Header Component
- Three variants: dark, light, confirmation
- Integrated search functionality
- Responsive navigation

### Experience Cards
- Hover animations
- Image zoom effects
- Price display
- Location tags
- Highlighted cards with blue border

### Booking Flow
- Date selection
- Time slot selection with availability
- Quantity controls
- Real-time price calculation
- Form validation

### Animations
- Staggered card entrance
- Smooth page transitions
- Interactive hover states
- Success checkmark animation

## 🎯 No Backend Required

This is a **frontend-only** implementation. All functionality is handled client-side with:
- React state management
- Client-side routing
- Form validation
- Mock data

## 📝 Notes

- All images are from Unsplash
- Animations are optimized for performance
- Fully accessible with keyboard navigation
- SEO-friendly with proper meta tags
