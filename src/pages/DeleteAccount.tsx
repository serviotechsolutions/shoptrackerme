import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Trash2, Clock, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DeleteAccount = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl flex items-center gap-2">
              <Trash2 className="h-6 w-6 text-destructive" />
              Delete Your ShopTracker Account
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm md:prose-base max-w-none dark:prose-invert">
            <p className="text-muted-foreground">
              We understand that you may need to delete your ShopTracker account. This page explains how you can request account deletion and what data will be removed.
            </p>

            <div className="bg-muted/50 p-4 rounded-lg border border-border my-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-semibold mt-0 mb-2">Important Notice</h3>
                  <p className="text-sm mb-0">Account deletion is permanent and cannot be undone. Please ensure you have backed up any important data before proceeding.</p>
                </div>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">What Data Will Be Deleted?</h2>
            <p>When you request account deletion, the following information will be permanently removed from our systems:</p>
            <ul className="space-y-2">
              <li><strong>Account Credentials:</strong> Your username, email address, and password</li>
              <li><strong>Business Information:</strong> Your shop name and business details</li>
              <li><strong>Inventory Data:</strong> All products, stock information, and pricing data</li>
              <li><strong>Sales Records:</strong> Transaction history and sales reports</li>
              <li><strong>User Preferences:</strong> App settings and customizations</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">How to Request Account Deletion</h2>
            <p>To delete your ShopTracker account, please follow these simple steps:</p>
            <ol className="space-y-3">
              <li>
                <strong>Send an Email:</strong> Compose an email to{" "}
                <a href="mailto:serviotechsolutions@gmail.com" className="text-primary hover:underline inline-flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  serviotechsolutions@gmail.com
                </a>
              </li>
              <li>
                <strong>Subject Line:</strong> Use "Delete My ShopTracker Account" as the subject
              </li>
              <li>
                <strong>Include Your Details:</strong> In the email body, provide:
                <ul className="mt-2 space-y-1">
                  <li>Your registered email address</li>
                  <li>Your shop name (if applicable)</li>
                  <li>Reason for deletion (optional)</li>
                </ul>
              </li>
              <li>
                <strong>Confirmation:</strong> You will receive a confirmation email acknowledging your deletion request
              </li>
            </ol>

            <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 my-6">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-semibold mt-0 mb-2">Deletion Timeline</h3>
                  <p className="text-sm mb-0">
                    Your account and all associated data will be permanently deleted within <strong>30 days</strong> of receiving your deletion request. During this period, your account will be deactivated and inaccessible.
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">Before You Go</h2>
            <p>Before requesting account deletion, please consider:</p>
            <ul className="space-y-2">
              <li>Exporting any important data or reports you may need in the future</li>
              <li>Canceling any active subscriptions or premium features</li>
              <li>Whether temporarily deactivating your account might better suit your needs</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">Need Help?</h2>
            <p>
              If you have questions about account deletion or need assistance with any aspect of ShopTracker, please don't hesitate to contact us at{" "}
              <a href="mailto:serviotechsolutions@gmail.com" className="text-primary hover:underline">
                serviotechsolutions@gmail.com
              </a>
              . We're here to help!
            </p>

            <div className="border-t border-border pt-6 mt-8">
              <p className="text-sm text-muted-foreground">
                <strong>Serviotech Solutions</strong>
                <br />
                Email: serviotechsolutions@gmail.com
                <br />
                Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DeleteAccount;
