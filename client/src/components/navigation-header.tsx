import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function NavigationHeader() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: dashboard } = useQuery({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isActive = (path: string) => location === path;

  return (
    <nav className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                </svg>
              </div>
              <span className="ml-3 text-xl font-bold text-foreground">AI Tutor</span>
            </div>
            <div className="hidden md:block ml-10">
              <div className="flex items-baseline space-x-4">
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/")}
                  className={isActive("/") ? "text-primary font-medium" : "text-muted-foreground"}
                  data-testid="nav-dashboard"
                >
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/lessons")}
                  className={location.startsWith("/lesson") ? "text-primary font-medium" : "text-muted-foreground"}
                  data-testid="nav-lessons"
                >
                  Lessons
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/progress")}
                  className={isActive("/progress") ? "text-primary font-medium" : "text-muted-foreground"}
                  data-testid="nav-progress"
                >
                  Progress
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/settings")}
                  className={isActive("/settings") ? "text-primary font-medium" : "text-muted-foreground"}
                  data-testid="nav-settings"
                >
                  Settings
                </Button>
                {user?.isAdmin && (
                  <Button
                    variant="ghost"
                    onClick={() => setLocation("/admin")}
                    className={isActive("/admin") ? "text-primary font-medium" : "text-muted-foreground"}
                    data-testid="nav-admin"
                  >
                    Admin
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 text-sm">
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                <span className="text-muted-foreground" data-testid="text-usage-minutes">
                  {dashboard?.usage?.voiceMinutes || '0 / 60 min'}
                </span>
              </div>
              <div className="text-muted-foreground">|</div>
              <Badge variant="secondary" data-testid="badge-plan">
                {dashboard?.user?.plan || 'Single Subject Plan'}
              </Badge>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 text-sm" data-testid="button-user-menu">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground font-medium text-sm">
                      {dashboard?.user?.initials || user?.username?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="text-foreground font-medium">
                    {dashboard?.user?.name || user?.username || 'User'}
                  </span>
                  <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="menu-profile">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  Profile
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-settings">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                  </svg>
                  Settings
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => setLocation("/subscribe")} data-testid="menu-billing">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"/>
                  </svg>
                  Billing
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                  data-testid="menu-logout"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
                  </svg>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
