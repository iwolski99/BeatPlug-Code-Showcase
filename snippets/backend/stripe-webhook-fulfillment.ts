import express, { type Express, type Request, type Response } from "express";
import Stripe from "stripe";
import { storage } from "../private-app/storage";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "<server-side-secret>", {
  apiVersion: "2024-06-20" as any,
});

export function registerStripeBodyHandling(app: Express) {
  // Preserve the raw body for Stripe signature verification.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/webhook/stripe")) {
      return next();
    }

    return express.json()(req, res, next);
  });
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/webhook/stripe", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      let event: Stripe.Event;

      if (webhookSecret) {
        const sig = req.headers["stripe-signature"] as string;
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }

      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object as any;
        const metadata = paymentIntent.metadata;

        const existingOrder = await storage.getOrderByStripePaymentIntentId(paymentIntent.id);
        if (existingOrder) {
          return res.json({ received: true, status: "already_processed" });
        }

        const cartItems = JSON.parse(metadata.cartItems);
        const customerEmail = metadata.customerEmail;
        const customerName = metadata.customerName;

        let serverCalculatedTotal = 0;
        const validatedOrderItems = [];

        for (const item of cartItems) {
          const beat = await storage.getBeat(item.beatId);
          if (!beat) {
            continue;
          }

          let priceString;
          if (item.licenseType === "exclusive") {
            priceString = beat.exclusivePrice;
          } else if (item.licenseType === "premium") {
            priceString = beat.premiumPrice;
          } else {
            priceString = beat.standardPrice;
          }

          const price = Number(priceString);
          if (Number.isNaN(price)) {
            continue;
          }

          serverCalculatedTotal += price;
          validatedOrderItems.push({
            beatId: item.beatId,
            price: price.toFixed(2),
            licenseType: item.licenseType || "standard",
          });
        }

        const stripeAmountInDollars = paymentIntent.amount / 100;
        if (Math.abs(serverCalculatedTotal - stripeAmountInDollars) > 0.01) {
          return res.status(400).json({ error: "Payment amount verification failed" });
        }

        const userIdFromMetadata = metadata.userId;
        const userId = userIdFromMetadata && userIdFromMetadata !== "" ? userIdFromMetadata : null;

        const orderData = {
          userId,
          email: customerEmail,
          firstName: customerName.split(" ")[0],
          lastName: customerName.split(" ").slice(1).join(" "),
          total: serverCalculatedTotal.toFixed(2),
          stripePaymentIntentId: paymentIntent.id,
        };

        try {
          const order = await storage.createOrderWithItems(orderData, validatedOrderItems);
          await storage.updateOrderStatus(order.id, "completed");
        } catch (error: any) {
          if (error.code === "23505" && error.constraint?.includes("stripe_payment_intent_id")) {
            const existingOrderFromDb = await storage.getOrderByStripePaymentIntentId(paymentIntent.id);
            if (existingOrderFromDb) {
              return res.json({ received: true, status: "already_processed_db" });
            }
          }
          throw error;
        }
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}
