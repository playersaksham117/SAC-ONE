import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import 'first_setup_screen.dart';
import 'login_screen.dart';
import 'pin_login_screen.dart';
import 'set_pin_screen.dart';

class AuthGate extends StatelessWidget {
  final Widget child;
  const AuthGate({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        // Loading auth state
        if (auth.isLoading) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Starting TracInvent...'),
                ],
              ),
            ),
          );
        }

        // First ever launch — no users exist yet
        if (auth.isFirstRun) {
          return const FirstSetupScreen();
        }

        // Authenticated
        if (auth.isLoggedIn) {
          if (auth.needsPinSetup) {
            return SetPinScreen(onComplete: child);
          }
          return child;
        }

        // Has PIN saved → quick unlock
        if (auth.pinEnabled && auth.savedUserId != null) {
          return const PinLoginScreen();
        }

        // Regular login
        return const LoginScreen();
      },
    );
  }
}
