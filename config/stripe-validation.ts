/**
 * Validación de claves de Stripe según ambiente
 * Previene uso incorrecto de claves test/live
 */

const validateStripeKeys = () => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const nodeEnv = process.env.NODE_ENV;

  // Verificar que las claves existan
  if (!stripeSecretKey || !stripePublishableKey) {
    console.warn('⚠️  WARNING: Stripe keys not configured');
    return;
  }

  const isTestKey = stripeSecretKey.startsWith('sk_test_');
  const isLiveKey = stripeSecretKey.startsWith('sk_live_');
  const isProduction = nodeEnv === 'production';

  // CASO 1: Producción con claves de test
  if (isProduction && isTestKey) {
    console.error('❌ ERROR: Using TEST Stripe keys in PRODUCTION environment!');
    console.error('   Please configure live keys (sk_live_*) for production.');
    console.error('   Current key:', stripeSecretKey.substring(0, 15) + '...');
    // No lanzar error para permitir desarrollo, solo advertir
  }

  // CASO 2: Desarrollo con claves de producción
  if (!isProduction && isLiveKey) {
    console.error('❌ ERROR: Using LIVE Stripe keys in DEVELOPMENT environment!');
    console.error('   This could cause real charges. Use test keys (sk_test_*) instead.');
    console.error('   Current environment:', nodeEnv);
    throw new Error('Live Stripe keys detected in non-production environment');
  }

  // CASO 3: Claves válidas
  if (isProduction && isLiveKey) {
    console.log('✅ Stripe: Using LIVE keys in production');
  } else if (!isProduction && isTestKey) {
    console.log('✅ Stripe: Using TEST keys in development');
  }

  // Verificar consistencia entre secret y publishable key
  const pubKeyPrefix = stripePublishableKey.substring(0, 7); // pk_test_ o pk_live_
  const expectedPubKeyPrefix = isTestKey ? 'pk_test' : 'pk_live';

  if (!pubKeyPrefix.startsWith(expectedPubKeyPrefix)) {
    console.error('❌ ERROR: Mismatch between secret and publishable keys!');
    console.error(`   Secret key: ${stripeSecretKey.substring(0, 10)}...`);
    console.error(`   Publishable key: ${stripePublishableKey.substring(0, 10)}...`);
    throw new Error('Stripe key mismatch detected');
  }
};

module.exports = { validateStripeKeys };