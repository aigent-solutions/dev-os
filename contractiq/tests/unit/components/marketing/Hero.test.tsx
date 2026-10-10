import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_ALT, Hero } from '@/components/marketing/Hero';

// 02-landing.md §12.
describe('Hero', () => {
  it('renders the single H1 with the value proposition', () => {
    render(<Hero />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Understand any NDA or MSA in minutes — not hours');
  });

  it('CTAs go to /signup and /login', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  });

  it('the demo GIF has non-empty alt and explicit width and height (no layout shift)', () => {
    render(<Hero />);
    const img = screen.getByRole('img', { name: DEMO_ALT });
    expect(img).toHaveAttribute('src', '/demo.gif');
    expect(img.getAttribute('alt')!.length).toBeGreaterThan(20);
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '750');
  });

  it('reduced motion swaps in the still poster', () => {
    const { container } = render(<Hero />);
    const source = container.querySelector('picture > source');
    expect(source).toHaveAttribute('media', '(prefers-reduced-motion: reduce)');
    expect(source).toHaveAttribute('srcset', '/demo-poster.png');
  });
});
