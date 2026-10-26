// Prix affiché sur la page Pro. Il doit correspondre au prix configuré dans Stripe (STRIPE_PRICE_ID).
export const PRO_PRICE_LABEL = process.env.NEXT_PUBLIC_PRO_PRICE_LABEL || "9.90 CHF";
export const PRO_PRICE_PERIOD = process.env.NEXT_PUBLIC_PRO_PRICE_PERIOD || "par mois";
