import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email"),
  preferredLanguage: z.string(),
  voiceStyle: z.string(),
  speechSpeed: z.string(),
  volumeLevel: z.number().min(0).max(100),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      preferredLanguage: user?.preferredLanguage || "english",
      voiceStyle: user?.voiceStyle || "cheerful",
      speechSpeed: user?.speechSpeed || "1.0",
      volumeLevel: user?.volumeLevel || 75,
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const response = await apiRequest("PUT", "/api/settings", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Settings updated",
        description: "Your preferences have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createPortalSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer-portal");
      return await response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Error accessing customer portal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = (data: SettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  const handleManageSubscription = () => {
    createPortalSessionMutation.mutate();
  };

  const handleResetSettings = () => {
    form.reset({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      preferredLanguage: "english",
      voiceStyle: "cheerful",
      speechSpeed: "1.0",
      volumeLevel: 75,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-settings-title">
              Settings
            </h1>
            <p className="text-muted-foreground">Manage your account, subscription, and preferences</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSaveSettings)} className="space-y-8">
              
              {/* Account Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-firstname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="preferredLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Language</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-language">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="english">English</SelectItem>
                            <SelectItem value="spanish">Spanish</SelectItem>
                            <SelectItem value="both">Both English and Spanish</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Subscription Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Subscription</CardTitle>
                    <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-sm font-medium">
                      {user?.subscriptionPlan === 'all' ? 'All Subjects Plan' : 'Single Subject Plan'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-border">
                    <div>
                      <p className="font-medium text-foreground">Current Plan</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.subscriptionPlan === 'all' 
                          ? 'Access to Math, English, and Spanish' 
                          : 'Access to one subject'
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        ${user?.subscriptionPlan === 'all' ? '199.00' : '99.99'}/month
                      </p>
                      <p className="text-sm text-muted-foreground">Active</p>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <Button 
                      type="button"
                      onClick={handleManageSubscription}
                      disabled={createPortalSessionMutation.isPending}
                      data-testid="button-manage-subscription"
                    >
                      {createPortalSessionMutation.isPending ? "Opening..." : "Manage Subscription"}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => window.location.href = '/subscribe'}
                      data-testid="button-change-plan"
                    >
                      Change Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Voice & Audio Settings */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Voice & Audio Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="voiceStyle"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Voice Style</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-1 md:grid-cols-3 gap-3"
                          >
                            <div className="border border-primary bg-primary/5 rounded-lg p-4 cursor-pointer">
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="cheerful" id="cheerful" />
                                <div>
                                  <label htmlFor="cheerful" className="font-medium text-foreground cursor-pointer">
                                    Cheerful
                                  </label>
                                  <p className="text-sm text-muted-foreground">Upbeat and encouraging</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="empathetic" id="empathetic" />
                                <div>
                                  <label htmlFor="empathetic" className="font-medium text-foreground cursor-pointer">
                                    Empathetic
                                  </label>
                                  <p className="text-sm text-muted-foreground">Understanding and patient</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center space-x-3">
                                <RadioGroupItem value="professional" id="professional" />
                                <div>
                                  <label htmlFor="professional" className="font-medium text-foreground cursor-pointer">
                                    Professional
                                  </label>
                                  <p className="text-sm text-muted-foreground">Clear and focused</p>
                                </div>
                              </div>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="speechSpeed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Speech Speed</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0.5}
                                max={2}
                                step={0.1}
                                value={[parseFloat(field.value)]}
                                onValueChange={([value]) => field.onChange(value.toString())}
                                data-testid="slider-speech-speed"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Slow</span>
                                <span>Normal</span>
                                <span>Fast</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Volume Level</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value]}
                                onValueChange={([value]) => field.onChange(value)}
                                data-testid="slider-volume"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Quiet</span>
                                <span>Medium</span>
                                <span>Loud</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save Actions */}
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={handleResetSettings}
                  data-testid="button-reset-settings"
                >
                  Reset to Defaults
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
