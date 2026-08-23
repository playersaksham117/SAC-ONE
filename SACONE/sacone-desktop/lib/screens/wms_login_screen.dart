/// ============================================================
/// LOGIN SCREEN - User authentication
/// ============================================================
/// 
/// Clean, professional login interface for WMS.
/// Supports username/password and PIN authentication.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/constants/app_constants.dart';
import '../providers/wms_providers.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _pinController = TextEditingController();
  
  bool _obscurePassword = true;
  bool _usePinLogin = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    
    final auth = context.read<AuthProvider>();
    
    if (_usePinLogin) {
      await auth.loginWithPin(
        _usernameController.text.trim(),
        _pinController.text.trim(),
      );
    } else {
      await auth.login(
        _usernameController.text.trim(),
        _passwordController.text,
      );
    }
    
    if (auth.state == AuthState.error && mounted) {
      _showError(auth.errorMessage ?? 'Login failed');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isWide = MediaQuery.of(context).size.width > 800;
    
    return Scaffold(
      body: Row(
        children: [
          // Left panel - branding (only on wide screens)
          if (isWide)
            Expanded(
              flex: 2,
              child: Container(
                color: colorScheme.primary,
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.inventory_2_rounded,
                        size: 80,
                        color: colorScheme.onPrimary,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        AppInfo.name,
                        style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                          color: colorScheme.onPrimary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Warehouse Management System',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: colorScheme.onPrimary.withValues(alpha: 0.8),
                        ),
                      ),
                      const SizedBox(height: 48),
                      _FeatureItem(
                        icon: Icons.location_on_outlined,
                        text: 'Cell-level stock tracking',
                        color: colorScheme.onPrimary,
                      ),
                      const SizedBox(height: 16),
                      _FeatureItem(
                        icon: Icons.swap_horiz_rounded,
                        text: 'Real-time movements',
                        color: colorScheme.onPrimary,
                      ),
                      const SizedBox(height: 16),
                      _FeatureItem(
                        icon: Icons.analytics_outlined,
                        text: 'FEFO optimization',
                        color: colorScheme.onPrimary,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          
          // Right panel - login form
          Expanded(
            flex: isWide ? 3 : 1,
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!isWide) ...[
                          Icon(
                            Icons.inventory_2_rounded,
                            size: 64,
                            color: colorScheme.primary,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            AppInfo.name,
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 32),
                        ],
                        
                        Text(
                          'Sign in',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Enter your credentials to continue',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colorScheme.outline,
                          ),
                        ),
                        const SizedBox(height: 32),
                        
                        // Login type toggle
                        SegmentedButton<bool>(
                          segments: const [
                            ButtonSegment(
                              value: false,
                              label: Text('Password'),
                              icon: Icon(Icons.lock_outline),
                            ),
                            ButtonSegment(
                              value: true,
                              label: Text('PIN'),
                              icon: Icon(Icons.dialpad),
                            ),
                          ],
                          selected: {_usePinLogin},
                          onSelectionChanged: (value) {
                            setState(() {
                              _usePinLogin = value.first;
                              _passwordController.clear();
                              _pinController.clear();
                            });
                          },
                        ),
                        const SizedBox(height: 24),
                        
                        // Username field
                        TextFormField(
                          controller: _usernameController,
                          decoration: const InputDecoration(
                            labelText: 'Username',
                            prefixIcon: Icon(Icons.person_outline),
                          ),
                          textInputAction: TextInputAction.next,
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return 'Please enter your username';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        
                        // Password or PIN field
                        if (_usePinLogin)
                          TextFormField(
                            controller: _pinController,
                            decoration: const InputDecoration(
                              labelText: 'PIN',
                              prefixIcon: Icon(Icons.dialpad),
                            ),
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(6),
                            ],
                            obscureText: true,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _handleLogin(),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your PIN';
                              }
                              if (value.length < 4) {
                                return 'PIN must be at least 4 digits';
                              }
                              return null;
                            },
                          )
                        else
                          TextFormField(
                            controller: _passwordController,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscurePassword
                                      ? Icons.visibility_outlined
                                      : Icons.visibility_off_outlined,
                                ),
                                onPressed: () {
                                  setState(() {
                                    _obscurePassword = !_obscurePassword;
                                  });
                                },
                              ),
                            ),
                            obscureText: _obscurePassword,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _handleLogin(),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your password';
                              }
                              return null;
                            },
                          ),
                        
                        const SizedBox(height: 32),
                        
                        // Login button
                        Consumer<AuthProvider>(
                          builder: (context, auth, _) {
                            final isLoading = auth.state == AuthState.authenticating;
                            
                            return FilledButton(
                              onPressed: isLoading ? null : _handleLogin,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: isLoading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          valueColor: AlwaysStoppedAnimation(Colors.white),
                                        ),
                                      )
                                    : const Text('Sign in'),
                              ),
                            );
                          },
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Version info
                        Text(
                          'v${AppInfo.version}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colorScheme.outline,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureItem extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;

  const _FeatureItem({
    required this.icon,
    required this.text,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 12),
        Text(
          text,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: color.withValues(alpha: 0.9),
          ),
        ),
      ],
    );
  }
}
