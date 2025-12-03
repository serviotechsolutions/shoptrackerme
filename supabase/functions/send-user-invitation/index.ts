import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  full_name: string;
  role: string;
  shop_name: string;
  inviter_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-user-invitation function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("Email service not configured. Please add RESEND_API_KEY.");
    }
    
    console.log("RESEND_API_KEY is configured, initializing Resend client");
    const resend = new Resend(resendApiKey);

    const body = await req.json();
    console.log("Request body received:", JSON.stringify(body));
    
    const { email, full_name, role, shop_name, inviter_name }: InvitationRequest = body;

    if (!email || !full_name || !role || !shop_name || !inviter_name) {
      console.error("Missing required fields:", { email, full_name, role, shop_name, inviter_name });
      throw new Error("Missing required fields in invitation request");
    }

    console.log(`Sending invitation to ${email} for ${shop_name}`);

    const emailResponse = await resend.emails.send({
      from: "ShopTracker <onboarding@resend.dev>",
      to: [email],
      subject: `You've been invited to join ${shop_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1f2937; margin: 0; font-size: 28px;">Welcome to ${shop_name}!</h1>
            </div>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${full_name},</p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              <strong>${inviter_name}</strong> has invited you to join <strong>${shop_name}</strong> as a <strong style="color: #2563eb;">${role}</strong>.
            </p>
            
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #0ea5e9;">
              <h2 style="margin: 0 0 16px 0; color: #0369a1; font-size: 18px;">Getting Started</h2>
              <p style="color: #374151; margin: 0 0 12px 0;">To accept this invitation and create your account:</p>
              <ol style="color: #374151; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Visit the ShopTracker app</li>
                <li style="margin-bottom: 8px;">Sign up using this email: <strong>${email}</strong></li>
                <li style="margin-bottom: 8px;">Complete your profile setup</li>
              </ol>
            </div>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              If you have any questions, please contact ${inviter_name}.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Powered by ShopTracker • Developed by Serviotech Solutions
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse));

    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      throw new Error(`Failed to send email: ${emailResponse.error.message}`);
    }

    console.log("Invitation sent successfully to:", email);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-user-invitation function:", error.message || error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send invitation" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
