import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

/// Shows [child] only when the current user has the given capability.
/// Otherwise renders [fallback] (default: nothing).
class RoleGate extends StatelessWidget {
  final String capability;
  final Widget child;
  final Widget fallback;

  const RoleGate({
    super.key,
    required this.capability,
    required this.child,
    this.fallback = const SizedBox.shrink(),
  });

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return auth.can(capability) ? child : fallback;
  }
}

/// Shows [child] only when the current user is an admin.
class AdminOnly extends StatelessWidget {
  final Widget child;
  final Widget fallback;
  const AdminOnly({
    super.key,
    required this.child,
    this.fallback = const SizedBox.shrink(),
  });

  @override
  Widget build(BuildContext context) {
    return context.watch<AuthProvider>().isAdmin ? child : fallback;
  }
}
