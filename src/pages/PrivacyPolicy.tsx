import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-muted-foreground text-sm">
              How we handle your data and privacy
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy Policy for ShopTracker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-6 text-sm">
                <div>
                  <p className="font-semibold mb-2">Effective Date: January 2025</p>
                  <p className="text-muted-foreground">
                    ShopTracker ("we", "our", or "the app") respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we handle data when you use our mobile application.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Information Collection and Use</h3>
                  <p className="text-muted-foreground mb-2">
                    ShopTracker is designed with your privacy in mind:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>
                      <strong>No Personal Data Sale or Sharing:</strong> We do not sell, trade, or share your personal information with third parties.
                    </li>
                    <li>
                      <strong>Minimal Data Collection:</strong> We only collect information necessary to provide core app functionality.
                    </li>
                    <li>
                      <strong>User Control:</strong> You have full control over what data you choose to share with the app.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Camera Access</h3>
                  <p className="text-muted-foreground mb-2">
                    ShopTracker may request access to your device camera to provide essential features:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>
                      <strong>Purpose:</strong> Camera access is used solely for scanning barcodes/QR codes and taking product photos within the app.
                    </li>
                    <li>
                      <strong>No Unauthorized Storage:</strong> Photos taken through the app are not stored on our servers without your explicit consent.
                    </li>
                    <li>
                      <strong>User Consent:</strong> You will be prompted to grant camera permission when you first use camera-dependent features.
                    </li>
                    <li>
                      <strong>Revoke Access Anytime:</strong> You can revoke camera access at any time through your device settings (Settings → Apps → ShopTracker → Permissions).
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Data Storage and Security</h3>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>All data is stored locally on your device or in your secure cloud account.</li>
                    <li>We implement industry-standard security measures to protect your information.</li>
                    <li>No data is transmitted to third-party servers without your knowledge and consent.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Your Rights</h3>
                  <p className="text-muted-foreground mb-2">You have the right to:</p>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Access your data at any time within the app</li>
                    <li>Delete your data by uninstalling the application</li>
                    <li>Revoke permissions through your device settings</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Changes to This Privacy Policy</h3>
                  <p className="text-muted-foreground">
                    We may update this Privacy Policy from time to time. Any changes will be reflected with an updated "Effective Date" at the top of this document.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-base mb-3">Contact Us</h3>
                  <p className="text-muted-foreground mb-2">
                    If you have any questions or concerns about this Privacy Policy or how we handle your data, please contact us at:
                  </p>
                  <p className="text-muted-foreground">
                    <strong>Email:</strong> serviotechsolutions@gmail.com
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-muted-foreground italic">
                    By using ShopTracker, you agree to the terms outlined in this Privacy Policy.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PrivacyPolicy;
