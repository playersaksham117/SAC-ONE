import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

/// Shown on first launch when no users exist.
/// Creates the admin account that owns this installation.
class FirstSetupScreen extends StatefulWidget {
  const FirstSetupScreen({super.key});

  @override
  State<FirstSetupScreen> createState() => _FirstSetupScreenState();
}

class _FirstSetupScreenState extends State<FirstSetupScreen> {
  final _form     = GlobalKey<FormState>();
  final _name     = TextEditingController();
  final _username = TextEditingController();
  final _pass     = TextEditingController();
  final _confirm  = TextEditingController();
  bool _obscureA  = true;
  bool _obscureB  = true;
  bool _loading   = false;

  @override
  void dispose() {
    for (final c in [_name, _username, _pass, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);

    final ok = await context.read<AuthProvider>().createFirstAdmin(
          name:     _name.text.trim(),
          username: _username.text.trim(),
          password: _pass.text,
        );

    if (!ok && mounted) {
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(context.read<AuthProvider>().errorMessage ?? 'Setup failed'),
        backgroundColor: Colors.red,
      ));
    }
    // On success AuthGate rebuilds automatically
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F9FF),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: const BorderSide(color: Color(0xFFBFDBFE)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.inventory_2,
                            size: 48, color: Color(0xFF2563EB)),
                      ),
                      const SizedBox(height: 20),
                      const Text('Welcome to TracInvent',
                          style: TextStyle(
                              fontSize: 24, fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A)),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Text('Create your administrator account to get started',
                          style: TextStyle(
                              fontSize: 14, color: Colors.grey.shade600),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF9C3),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFFDE047)),
                        ),
                        child: const Text(
                          'This is a one-time setup. After this, new users can only be added by an administrator from Settings.',
                          style: TextStyle(fontSize: 12, color: Color(0xFF713F12)),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: 28),

                      _field(_name, 'Full Name', Icons.person_outline,
                          validator: (v) => (v?.trim().isEmpty ?? true) ? 'Required' : null),
                      const SizedBox(height: 16),
                      _field(_username, 'Username / Email', Icons.alternate_email,
                          validator: (v) {
                        if (v?.trim().isEmpty ?? true) return 'Required';
                        if (v!.trim().length < 3) return 'Minimum 3 characters';
                        return null;
                      }),
                      const SizedBox(height: 16),
                      _passwordField(_pass, 'Password', _obscureA, (v) {
                        setState(() => _obscureA = v);
                      }, validator: (v) {
                        if (v?.isEmpty ?? true) return 'Required';
                        if (v!.length < 6) return 'Minimum 6 characters';
                        return null;
                      }),
                      const SizedBox(height: 16),
                      _passwordField(_confirm, 'Confirm Password', _obscureB, (v) {
                        setState(() => _obscureB = v);
                      }, validator: (v) {
                        if (v != _pass.text) return 'Passwords do not match';
                        return null;
                      }),
                      const SizedBox(height: 28),

                      FilledButton(
                        onPressed: _loading ? null : _submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: _loading
                            ? const SizedBox(
                                height: 20, width: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : const Text('Create Admin Account',
                                style: TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, IconData icon,
      {String? Function(String?)? validator}) {
    return TextFormField(
      controller: c,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
      ),
      validator: validator,
    );
  }

  Widget _passwordField(TextEditingController c, String label, bool obscure,
      void Function(bool) onToggle,
      {String? Function(String?)? validator}) {
    return TextFormField(
      controller: c,
      obscureText: obscure,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => onToggle(!obscure),
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
      ),
      validator: validator,
    );
  }
}
