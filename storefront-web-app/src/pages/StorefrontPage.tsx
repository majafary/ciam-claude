import React from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Chip,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ShoppingCart as CartIcon,
  Star as StarIcon,
  LocalShipping as ShippingIcon,
  Security as SecurityIcon,
  Support as SupportIcon,
} from '@mui/icons-material';
import { useAuth } from 'ciam-ui';

// Mock product data
const featuredProducts = [
  {
    id: 1,
    name: 'Premium Wireless Headphones',
    price: 299.99,
    originalPrice: 399.99,
    image: 'https://via.placeholder.com/300x200/1976d2/white?text=Headphones',
    rating: 4.8,
    reviews: 124,
    badge: 'Best Seller',
  },
  {
    id: 2,
    name: 'Smart Fitness Watch',
    price: 199.99,
    image: 'https://via.placeholder.com/300x200/dc004e/white?text=Smart+Watch',
    rating: 4.6,
    reviews: 89,
    badge: 'New',
  },
  {
    id: 3,
    name: 'Portable Bluetooth Speaker',
    price: 79.99,
    originalPrice: 99.99,
    image: 'https://via.placeholder.com/300x200/4caf50/white?text=Speaker',
    rating: 4.7,
    reviews: 156,
    badge: 'Sale',
  },
  {
    id: 4,
    name: 'Wireless Charging Pad',
    price: 39.99,
    image: 'https://via.placeholder.com/300x200/ff9800/white?text=Charger',
    rating: 4.4,
    reviews: 67,
  },
];

const features = [
  {
    icon: <ShippingIcon />,
    title: 'Free Shipping',
    description: 'Free shipping on orders over $50',
  },
  {
    icon: <SecurityIcon />,
    title: 'Secure Checkout',
    description: '256-bit SSL encryption for your security',
  },
  {
    icon: <SupportIcon />,
    title: '24/7 Support',
    description: 'Round-the-clock customer support',
  },
];

const StorefrontPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAuthenticated, user } = useAuth();

  const handleAddToCart = (productId: number) => {
    console.log('Added product to cart:', productId);
    // TODO: Implement cart functionality
  };

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
          color: 'white',
          py: { xs: 4, md: 8 },
        }}
      >
        <Container>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography
                variant={isMobile ? 'h3' : 'h2'}
                component="h1"
                gutterBottom
                sx={{ fontWeight: 'bold' }}
              >
                Welcome to Our Store
              </Typography>
              <Typography
                variant="h6"
                sx={{ mb: 3, opacity: 0.9 }}
              >
                Discover amazing products at unbeatable prices. Quality guaranteed.
              </Typography>

              {isAuthenticated && user && (
                <Box sx={{ mb: 3 }}>
                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      Welcome back, {user.given_name || user.preferred_username}! 👋
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Enjoy exclusive member benefits and personalized recommendations.
                    </Typography>
                  </Paper>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="large"
                  sx={{
                    backgroundColor: 'white',
                    color: 'primary.main',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                  }}
                >
                  Shop Now
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{
                    borderColor: 'white',
                    color: 'white',
                    '&:hover': {
                      borderColor: 'white',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  Learn More
                </Button>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box
                component="img"
                src="https://via.placeholder.com/500x400/ffffff/1976d2?text=Hero+Product"
                alt="Featured Product"
                sx={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 2,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                }}
              />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: { xs: 4, md: 6 }, backgroundColor: 'grey.50' }}>
        <Container>
          <Grid container spacing={4}>
            {features.map((feature, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Paper
                  sx={{
                    p: 3,
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Box
                    sx={{
                      mb: 2,
                      p: 2,
                      borderRadius: '50%',
                      backgroundColor: 'primary.main',
                      color: 'white',
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" gutterBottom>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {feature.description}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Featured Products Section */}
      <Box sx={{ py: { xs: 4, md: 6 } }}>
        <Container>
          <Typography
            variant="h4"
            component="h2"
            textAlign="center"
            gutterBottom
            sx={{ mb: 4, fontWeight: 'bold' }}
          >
            Featured Products
          </Typography>

          <Grid container spacing={3}>
            {featuredProducts.map((product) => (
              <Grid item xs={12} sm={6} md={3} key={product.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[8],
                    },
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <CardMedia
                      component="img"
                      height="200"
                      image={product.image}
                      alt={product.name}
                    />
                    {product.badge && (
                      <Chip
                        label={product.badge}
                        color={product.badge === 'Sale' ? 'secondary' : 'primary'}
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                        }}
                      />
                    )}
                  </Box>

                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {product.name}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <StarIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                      <Typography variant="body2" sx={{ ml: 0.5, mr: 1 }}>
                        {product.rating}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        ({product.reviews} reviews)
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="h6"
                        color="primary.main"
                        sx={{ fontWeight: 'bold' }}
                      >
                        ${product.price}
                      </Typography>
                      {product.originalPrice && (
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ textDecoration: 'line-through' }}
                        >
                          ${product.originalPrice}
                        </Typography>
                      )}
                    </Box>
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<CartIcon />}
                      onClick={() => handleAddToCart(product.id)}
                    >
                      Add to Cart
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button variant="outlined" size="large">
              View All Products
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Newsletter Section */}
      <Box
        sx={{
          py: { xs: 4, md: 6 },
          backgroundColor: 'grey.900',
          color: 'white',
        }}
      >
        <Container>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h4" gutterBottom>
                Stay Updated
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.8 }}>
                Subscribe to our newsletter for exclusive deals and new product announcements.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box
                component="form"
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexDirection: { xs: 'column', sm: 'row' },
                }}
              >
                <Box
                  component="input"
                  placeholder="Enter your email"
                  sx={{
                    flexGrow: 1,
                    p: 1.5,
                    borderRadius: 1,
                    border: 'none',
                    fontSize: '1rem',
                  }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  sx={{ minWidth: 120 }}
                >
                  Subscribe
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default StorefrontPage;