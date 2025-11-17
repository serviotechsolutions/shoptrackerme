import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function TermsAndConditions() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/settings")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms & Conditions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last Updated: {new Date().toLocaleDateString()}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-6">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Introduction & Acceptance of Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Welcome to ShopTracker, developed and operated by Serviotech Solutions. These Terms and Conditions ("Terms") govern your access to and use of the ShopTracker application ("App"), available on web and mobile platforms. By downloading, installing, accessing, or using ShopTracker, you agree to be bound by these Terms. If you do not agree with any part of these Terms, you must not use the App.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Eligibility</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    You must be at least 18 years old or have reached the age of majority in your jurisdiction to use ShopTracker. By using the App, you represent and warrant that you meet these eligibility requirements. If you are using the App on behalf of a business or organization, you represent that you have the authority to bind that entity to these Terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. App Usage & Restrictions</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    ShopTracker is designed to help you manage inventory, track sales, scan products using QR codes, and store operational data. You agree to use the App only for lawful purposes and in accordance with these Terms.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    <strong>You agree NOT to:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                    <li>Use the App for any unlawful or fraudulent purpose</li>
                    <li>Attempt to gain unauthorized access to any portion of the App or its systems</li>
                    <li>Interfere with or disrupt the App's functionality or servers</li>
                    <li>Reverse engineer, decompile, or modify the App's source code</li>
                    <li>Use the App to transmit viruses, malware, or harmful code</li>
                    <li>Violate any applicable laws or regulations while using the App</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. User Accounts</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    To access certain features of ShopTracker, you may be required to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account. Serviotech Solutions is not liable for any loss or damage arising from your failure to protect your account information.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Camera Permissions</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    ShopTracker requests access to your device's camera solely for the purpose of scanning QR codes and capturing product images to facilitate inventory management. Camera access is used only when you actively initiate a scanning or image capture function. No images or video are stored, transmitted, or used without your explicit consent. You can revoke camera permissions at any time through your device settings, though this may limit certain features of the App.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Data Handling & Privacy</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Your privacy is important to us. The data you enter into ShopTracker, including inventory details, sales records, and operational information, is stored locally on your device or in connected services as configured by you.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    <strong>Key Privacy Principles:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                    <li>We do not sell, rent, or share your personal data with third parties for marketing purposes</li>
                    <li>You maintain full control over your data and can export or delete it at any time</li>
                    <li>Data transmission is encrypted to protect your information</li>
                    <li>We collect only the minimum data necessary for the App to function</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-2">
                    For complete details on how we collect, use, and protect your information, please review our{" "}
                    <a href="/privacy-policy" className="text-primary underline hover:no-underline">
                      Privacy Policy
                    </a>.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Intellectual Property Rights</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    All content, features, functionality, design, code, and materials within ShopTracker, including but not limited to text, graphics, logos, icons, software, and the overall "look and feel," are the exclusive property of Serviotech Solutions or its licensors and are protected by copyright, trademark, and other intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the App for personal or business purposes in accordance with these Terms. You may not reproduce, distribute, modify, or create derivative works based on any part of the App without our express written permission.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Third-Party Services or Integrations</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    ShopTracker may integrate with or link to third-party services, platforms, or content (e.g., cloud storage, payment processors, analytics tools). These third-party services operate under their own terms and privacy policies, which we encourage you to review. Serviotech Solutions is not responsible for the availability, content, security, or practices of any third-party services. Your use of such services is at your own risk.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Prohibited Activities</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    In addition to the restrictions outlined in Section 3, you specifically agree not to:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                    <li>Use the App to infringe upon the intellectual property rights of others</li>
                    <li>Upload, transmit, or store any content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
                    <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with any person or entity</li>
                    <li>Engage in any activity that could damage, disable, overburden, or impair the App or interfere with other users' enjoyment of the App</li>
                    <li>Use automated systems (bots, scrapers, etc.) to access the App without our prior written consent</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Limitation of Liability</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    To the fullest extent permitted by law, Serviotech Solutions and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, goodwill, or other intangible losses, resulting from:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                    <li>Your use or inability to use the App</li>
                    <li>Any unauthorized access to or alteration of your data</li>
                    <li>Any bugs, viruses, or harmful code transmitted through the App</li>
                    <li>Any errors, inaccuracies, or omissions in the App or content</li>
                    <li>Any third-party conduct or content on the App</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-2">
                    The App is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not guarantee that the App will be uninterrupted, secure, or error-free.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. App Modifications, Updates & Availability</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Serviotech Solutions reserves the right to modify, suspend, or discontinue any aspect of ShopTracker at any time, with or without notice. We may release updates, new features, or bug fixes periodically. You agree that we are not liable to you or any third party for any modification, suspension, or discontinuance of the App. We may also impose limits on certain features or restrict access to parts or all of the App without notice or liability.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">12. Termination of Access</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We reserve the right to terminate or suspend your access to ShopTracker immediately, without prior notice or liability, for any reason, including but not limited to your breach of these Terms. Upon termination, your right to use the App will cease immediately. You may also terminate your account at any time by discontinuing use of the App and deleting your account through the App settings. All provisions of these Terms that by their nature should survive termination shall survive, including but not limited to ownership provisions, warranty disclaimers, and limitations of liability.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">13. Governing Law</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Serviotech Solutions operates, without regard to its conflict of law provisions. You agree to submit to the personal and exclusive jurisdiction of the courts located within that jurisdiction for the resolution of any disputes arising out of or relating to these Terms or your use of the App.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">14. Changes to Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Serviotech Solutions reserves the right to update or modify these Terms at any time without prior notice. When we make changes, we will update the "Last Updated" date at the top of this page. We encourage you to review these Terms periodically. Your continued use of ShopTracker after any changes constitutes your acceptance of the new Terms. If you do not agree to the modified Terms, you must stop using the App.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">15. Contact Information</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have any questions, concerns, or feedback regarding these Terms & Conditions or ShopTracker, please contact us at:
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-2">
                    <strong>Email:</strong>{" "}
                    <a href="mailto:serviotechsolutions@gmail.com" className="text-primary underline hover:no-underline">
                      serviotechsolutions@gmail.com
                    </a>
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-4">
                    <strong>Developer:</strong> Serviotech Solutions
                  </p>
                </section>

                <section className="border-t pt-6 mt-6">
                  <p className="text-sm text-muted-foreground italic">
                    By using ShopTracker, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions. Thank you for choosing ShopTracker for your inventory and sales management needs.
                  </p>
                </section>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
