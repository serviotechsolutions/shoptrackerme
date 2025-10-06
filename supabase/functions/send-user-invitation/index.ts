import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, full_name, role, shop_name, inviter_name }: InvitationRequest = await req.json();

    console.log(`Sending invitation to ${email} for ${shop_name}`);

    const emailResponse = await resend.emails.send({
      from: "Shop Management <onboarding@resend.dev>",
      to: [email],
      subject: `You've been invited to join ${shop_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to ${shop_name}!</h1>
          <p>Hi ${full_name},</p>
          <p>${inviter_name} has invited you to join <strong>${shop_name}</strong> as a <strong>${role}</strong>.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="margin-top: 0;">Getting Started</h2>
            <p>To accept this invitation and create your account, please follow these steps:</p>
            <ol>
              <li>Visit the shop management platform</li>
              <li>Sign up using this email address: <strong>${email}</strong></li>
              <li>Complete your profile</li>
            </ol>
          </div>
          
          <p>If you have any questions, please contact ${inviter_name}.</p>
          
          <p style="color: #666; font-size: 12px; margin-top: 40px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    console.log("Invitation sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
