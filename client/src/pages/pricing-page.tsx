import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

export default function PricingPage() {
  const [, setLocation] = useLocation();

  const handleSelectPlan = (plan: 'single' | 'all') => {
    setLocation(`/subscribe?plan=${plan}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                </svg>
              </div>
              <span className="ml-3 text-xl font-bold text-foreground">AI Tutor</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/auth")} data-testid="button-sign-in">
                Sign In
              </Button>
              <Button onClick={() => setLocation("/auth")} data-testid="button-get-started">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-foreground mb-6" data-testid="text-hero-title">
              Learn with Your Personal AI Tutor
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Master Math, English, and Spanish with interactive voice lessons, personalized quizzes, and progress tracking. 
              Your AI tutor adapts to your learning style.
            </p>
            
            {/* Feature highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Live Voice Conversations</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Adaptive Learning</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className="text-muted-foreground">Progress Tracking</span>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            
            {/* Single Subject Plan */}
            <Card className="shadow-lg relative" data-testid="card-single-plan">
              <CardContent className="p-8">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-foreground mb-2">Single Subject</h3>
                  <p className="text-muted-foreground">Perfect for focused learning in one area</p>
                </div>
                
                <div className="mb-8">
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold text-foreground">$99</span>
                    <span className="text-xl text-muted-foreground ml-2">.99/month</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Choose Math, English, or Spanish</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">60 minutes of voice learning/week</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Interactive quizzes & progress tracking</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Session transcripts & resume feature</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Email support</span>
                  </div>
                </div>

                <Button 
                  className="w-full py-4 text-lg font-semibold"
                  onClick={() => handleSelectPlan('single')}
                  data-testid="button-select-single"
                >
                  Start Learning Today
                </Button>
              </CardContent>
            </Card>

            {/* All Subjects Plan */}
            <Card className="shadow-xl border-2 border-secondary relative" data-testid="card-all-plan">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-secondary text-secondary-foreground px-4 py-2">Most Popular</Badge>
              </div>
              
              <CardContent className="p-8">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-foreground mb-2">All Subjects</h3>
                  <p className="text-muted-foreground">Complete learning package for maximum growth</p>
                </div>
                
                <div className="mb-8">
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold text-foreground">$199</span>
                    <span className="text-xl text-muted-foreground ml-2">/month</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-sm text-muted-foreground line-through">$299.97 if purchased separately</span>
                    <Badge variant="secondary" className="ml-2">Save $100</Badge>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground font-medium">Math, English, AND Spanish</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground font-medium">90 minutes of voice learning/week</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Cross-subject learning insights</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Advanced progress analytics</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Priority support</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-foreground">Early access to new subjects</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground py-4 text-lg font-semibold"
                  onClick={() => handleSelectPlan('all')}
                  data-testid="button-select-all"
                >
                  Get All Subjects Plan
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* FAQ Section */}
          <Card className="bg-muted/30 shadow-sm">
            <CardContent className="pt-8">
              <h3 className="text-2xl font-bold text-foreground text-center mb-8">Frequently Asked Questions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">How does voice learning work?</h4>
                  <p className="text-muted-foreground text-sm">
                    Your AI tutor uses advanced speech recognition to have natural conversations with you, 
                    adapting to your pace and learning style.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Can I cancel anytime?</h4>
                  <p className="text-muted-foreground text-sm">
                    Yes, you can cancel your subscription at any time through your account settings. No cancellation fees.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">What if I exceed my weekly minutes?</h4>
                  <p className="text-muted-foreground text-sm">
                    The system automatically switches to text-based learning to ensure you can continue your progress 
                    without interruption.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Is there a free trial?</h4>
                  <p className="text-muted-foreground text-sm">
                    We offer a 7-day free trial so you can experience the full power of AI tutoring before committing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
