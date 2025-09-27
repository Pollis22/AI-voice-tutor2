import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import LessonsPage from "@/pages/lessons-page";
import LessonPage from "@/pages/lesson-page";
import QuizPage from "@/pages/quiz-page";
import SettingsPage from "@/pages/settings-page";
import AdminPage from "@/pages/admin-page";
import PricingPage from "@/pages/pricing-page";
import SubscribePage from "@/pages/subscribe-page";
import TutorPage from "@/pages/tutor-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={TutorPage} />
      <ProtectedRoute path="/tutor" component={TutorPage} />
      <ProtectedRoute path="/old-lessons" component={HomePage} />
      <ProtectedRoute path="/lessons" component={LessonsPage} />
      <ProtectedRoute path="/lesson/:lessonId" component={LessonPage} />
      <ProtectedRoute path="/quiz/:lessonId" component={QuizPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/admin" component={AdminPage} />
      <ProtectedRoute path="/subscribe" component={SubscribePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
