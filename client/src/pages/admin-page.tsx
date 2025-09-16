import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Check admin access
  if (!user?.isAdmin) {
    setLocation("/");
    return null;
  }

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/users", currentPage, searchTerm],
    enabled: !!user?.isAdmin,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/admin/export");
      return response;
    },
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'users-export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: "User data has been exported to CSV file.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleExport = () => {
    exportMutation.mutate();
  };

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-admin-title">
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground">Manage users, subscriptions, and system health</p>
            </div>
            <Button 
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className="bg-secondary hover:bg-secondary/90"
              data-testid="button-export-csv"
            >
              {exportMutation.isPending ? "Exporting..." : "Export CSV"}
            </Button>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-users">
                      {stats?.totalUsers || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Active Subscriptions</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-active-subscriptions">
                      {stats?.activeSubscriptions || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Monthly Revenue</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-monthly-revenue">
                      {stats?.monthlyRevenue || "$0"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-accent" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Avg Session Time</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-avg-session">
                      {stats?.avgSessionTime || "0 min"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Users Table */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle>Recent Users</CardTitle>
                <form onSubmit={handleSearch} className="flex items-center space-x-3">
                  <Input
                    type="search"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                    data-testid="input-search-users"
                  />
                  <Button type="submit" size="sm" data-testid="button-search">
                    Search
                  </Button>
                </form>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData?.users?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersData?.users?.map((userData: any, index: number) => (
                        <TableRow key={userData.id} data-testid={`row-user-${index}`}>
                          <TableCell>
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center mr-4">
                                <span className="text-primary-foreground font-medium text-sm">
                                  {userData.firstName?.[0] || userData.username[0].toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium text-foreground">
                                  {userData.firstName && userData.lastName 
                                    ? `${userData.firstName} ${userData.lastName}`
                                    : userData.username
                                  }
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {userData.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={userData.subscriptionPlan === 'all' ? 'default' : 'secondary'}>
                              {userData.subscriptionPlan === 'all' ? 'All Subjects' : 'Single Subject'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {userData.weeklyVoiceMinutesUsed || 0}/
                            {userData.subscriptionPlan === 'all' ? '90' : '60'} min
                          </TableCell>
                          <TableCell>
                            <Badge variant={userData.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                              {userData.subscriptionStatus || 'Active'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              data-testid={`button-edit-user-${index}`}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}

              {usersData?.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, usersData.totalCount)} of {usersData.totalCount} users
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        data-testid="button-previous-page"
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="bg-primary text-primary-foreground"
                      >
                        {currentPage}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= usersData.totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
