import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation, useSearch } from 'wouter';
import { NavigationHeader } from '@/components/navigation-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
// Use a test key if no key is provided (for development/testing)
const stripeKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_51O6lUpBx1IpIbNuqEVRhAeGKqnBTJjS3MK3l0PcQRmFooIBCVmVEH01123Sm9xz123Jc5fHfUv7123yNTkZD123400Qhj4JQh3';

// Lazy load Stripe with error handling to prevent unhandled rejections
let stripePromise: Promise<any> | null = null;

const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(stripeKey).catch((error) => {
      console.warn('Stripe.js failed to load:', error);
      // Analytics hook for Stripe load failure
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'stripe_load_error', {
          event_category: 'error',
          event_label: error.message || 'unknown'
        });
      }
      return null; // Return null on failure to prevent crashes
    });
  }
  return stripePromise;
};

const SubscribeForm = ({ plan }: { plan: string }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    if (!stripe || !elements) {
      setIsProcessing(false);
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin,
      },
    });

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Payment Successful",
        description: "Welcome to AI Tutor! You can now start learning.",
      });
      setLocation("/");
    }
    
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full py-3 text-lg font-semibold" 
        disabled={!stripe || isProcessing}
        data-testid="button-complete-subscription"
      >
        {isProcessing ? "Processing..." : `Subscribe to ${plan === 'all' ? 'All Subjects' : 'Single Subject'} Plan`}
      </Button>
    </form>
  );
};

export default function SubscribePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const plan = params.get('plan') || 'all';
  const [clientSecret, setClientSecret] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      setLocation("/auth");
      return;
    }

    // Create subscription as soon as the page loads
    apiRequest("POST", "/api/get-or-create-subscription", { plan })
      .then((res) => res.json())
      .then((data) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          toast({
            title: "Setup Error",
            description: "Unable to set up payment. Please try again.",
            variant: "destructive",
          });
        }
      })
      .catch((error) => {
        toast({
          title: "Setup Error",
          description: error.message,
          variant: "destructive",
        });
      });
  }, [user, plan, setLocation, toast]);

  if (!user) {
    return null;
  }

  const planDetails = {
    single: {
      name: 'Single Subject',
      price: '$99.99',
      features: [
        'Choose Math, English, or Spanish',
        '60 minutes of voice learning per week',
        'Interactive quizzes & progress tracking',
        'Session transcripts & resume feature',
        'Email support'
      ]
    },
    all: {
      name: 'All Subjects',
      price: '$199.00',
      features: [
        'Math, English, AND Spanish',
        '90 minutes of voice learning per week',
        'Cross-subject learning insights',
        'Advanced progress analytics',
        'Priority support',
        'Early access to new subjects'
      ]
    }
  };

  const currentPlan = planDetails[plan as keyof typeof planDetails];

  if (!clientSecret) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Setting up your subscription...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-subscribe-title">
              Complete Your Subscription
            </h1>
            <p className="text-muted-foreground">
              Start your learning journey with AI Tutor today
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Plan Summary */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {currentPlan.name}
                  {plan === 'all' && <Badge className="bg-secondary text-secondary-foreground">Most Popular</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-4xl font-bold text-foreground mb-2">
                    {currentPlan.price}
                    <span className="text-lg text-muted-foreground font-normal">/month</span>
                  </div>
                  {plan === 'all' && (
                    <p className="text-sm text-muted-foreground">
                      <span className="line-through">$299.97 if purchased separately</span>{' '}
                      <Badge variant="secondary" className="ml-2">Save $100</Badge>
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">What's included:</h4>
                  {currentPlan.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <svg className="w-5 h-5 text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                      <span className="text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-secondary/5 rounded-lg p-4">
                  <p className="text-sm text-secondary-foreground">
                    <strong>7-day free trial</strong> - Cancel anytime during your trial period with no charges.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Elements stripe={getStripe()} options={{ clientSecret }}>
                  <SubscribeForm plan={plan} />
                </Elements>
                
                <div className="mt-6 pt-4 border-t border-border">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                    </svg>
                    <span>Your payment information is secure and encrypted</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Terms */}
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              By subscribing, you agree to our Terms of Service and Privacy Policy.{' '}
              <Button variant="link" className="p-0 h-auto text-sm" onClick={() => setLocation("/pricing")}>
                Change plan
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
