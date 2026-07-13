'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Video,
  Share2,
  MessageSquare,
  Users,
  Zap,
  Lock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function Home() {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border backdrop-blur-md bg-background/80 dark:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-bold text-xl text-foreground dark:text-accent">TSMeet</h1>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-foreground/70 hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-foreground/70 hover:text-foreground transition-colors"
            >
              About
            </a>
            <a href="#contact" className="text-foreground/70 hover:text-foreground transition-colors">
              Contact
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/auth/register">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Sign Up
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block mb-6">
            <div className="px-4 py-2 rounded-full border border-primary/20 bg-primary/5 dark:bg-primary/10">
              <p className="text-sm text-primary font-medium">Private. Secure. Built for teams.</p>
            </div>
          </div>

          <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance">
            <span className="text-foreground">Video conferencing</span>{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              made simple
            </span>
          </h2>

          <p className="text-xl text-foreground/60 dark:text-foreground/70 mb-8 max-w-2xl mx-auto text-balance">
            TSMeet is a private meeting and scheduling platform for teams that need reliable calls, screen sharing, recordings, and booking workflows in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link href="/auth/register">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                Start a Meeting
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="px-8 border-primary/20 bg-transparent">
              Book a Demo
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 blur-3xl -z-10 rounded-3xl opacity-20"></div>
            <Card className="border-primary/10 bg-card/50 backdrop-blur-sm p-8 sm:p-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
                <div className="text-center group hover:-translate-y-1 transition-all duration-300 p-4 rounded-xl hover:bg-primary/5">
                  <div className="mb-4 flex justify-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-2 text-foreground">Group Calls</h3>
                  <p className="text-sm text-foreground/60 dark:text-foreground/70">
                    Host 1-to-1 or large group meetings with HD audio & video
                  </p>
                </div>

                <div className="text-center group hover:-translate-y-1 transition-all duration-300 p-4 rounded-xl hover:bg-primary/5">
                  <div className="mb-4 flex justify-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Share2 className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-2 text-foreground">Screen Sharing</h3>
                  <p className="text-sm text-foreground/60 dark:text-foreground/70">
                    Share your screen with zero latency and perfect clarity
                  </p>
                </div>

                <div className="text-center group hover:-translate-y-1 transition-all duration-300 p-4 rounded-xl hover:bg-primary/5">
                  <div className="mb-4 flex justify-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <MessageSquare className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-2 text-foreground">Instant Chat</h3>
                  <p className="text-sm text-foreground/60 dark:text-foreground/70">
                    Real-time messaging during your meetings
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything You Need
            </h3>
            <p className="text-lg text-foreground/60 dark:text-foreground/70 max-w-2xl mx-auto">
              Packed with features for seamless collaboration
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Zap,
                title: 'Lightning Fast',
                description:
                  'WebRTC peer-to-peer connections for ultra-low latency and bandwidth efficiency',
              },
              {
                icon: Lock,
                title: 'Secure by Default',
                description:
                  'Protected meeting access, host controls, and private infrastructure keep collaboration under your control',
              },
              {
                icon: Users,
                title: 'Built for Teams',
                description:
                  'Invite participants via link, no accounts needed for guests',
              },
              {
                icon: Video,
                title: 'Crystal Clear Video',
                description:
                  'Adaptive bitrate streaming and HD quality video up to 1080p',
              },
            ].map((feature, i) => (
              <Card
                key={i}
                className="p-6 border-primary/10 bg-card/40 dark:bg-card/30 backdrop-blur-sm hover:border-primary/30 hover:bg-card/60 dark:hover:bg-card/50 transition-all duration-300"
              >
                <feature.icon className="w-10 h-10 text-primary mb-4" />
                <h4 className="font-semibold text-foreground mb-2">{feature.title}</h4>
                <p className="text-foreground/60 dark:text-foreground/70 text-sm">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 p-12 sm:p-16 text-center">
            <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
              Ready to connect?
            </h3>
            <p className="text-lg text-foreground/60 dark:text-foreground/70 mb-8 max-w-2xl mx-auto">
              Bring meetings, scheduling, and recording into one focused workspace
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/register">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                >
                  Get Started
                </Button>
              </Link>
              <a
                href="#contact"
                className="text-primary hover:text-primary/80 font-medium flex items-center gap-2"
              >
                Talk to Sales
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Video className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-foreground dark:text-accent">TSMeet</span>
              </div>
              <p className="text-sm text-foreground/60 dark:text-foreground/70">
                Video meetings and scheduling for focused teams
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Security
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="text-foreground/60 hover:text-foreground transition">
                    Data Processing
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div id="contact" className="border-t border-border pt-8 flex flex-col items-center gap-2">
            <p className="text-sm text-foreground/60 dark:text-foreground/70 text-center">
              © 2026 TSMeet. Private collaboration software for modern teams.
            </p>
            <p className="text-sm text-foreground/60 dark:text-foreground/70 text-center">
              Developed by <a href="https://tanvirsoft.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Tanvir Ahmmed</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
