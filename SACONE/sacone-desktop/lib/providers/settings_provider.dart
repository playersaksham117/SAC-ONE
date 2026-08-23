import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/settings.dart';

class SettingsProvider extends ChangeNotifier {
  AppSettings _settings = AppSettings();
  
  AppSettings get settings => _settings;
  Currency get currency => _settings.currency;

  Future<void> loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final settingsJson = prefs.getString('app_settings');
    
    if (settingsJson != null) {
      try {
        final json = jsonDecode(settingsJson);
        _settings = AppSettings.fromJson(json);
        notifyListeners();
      } catch (e) {
        debugPrint('Error loading settings: $e');
      }
    }
  }

  Future<void> updateCurrency(Currency currency) async {
    _settings = _settings.copyWith(currency: currency);
    await _saveSettings();
    notifyListeners();
  }

  Future<void> updateDateFormat(String format) async {
    _settings = _settings.copyWith(dateFormat: format);
    await _saveSettings();
    notifyListeners();
  }

  Future<void> updateStockAlerts(bool enabled) async {
    _settings = _settings.copyWith(showStockAlerts: enabled);
    await _saveSettings();
    notifyListeners();
  }

  Future<void> updateBarcodeStickerSize(BarcodeStickerSize size) async {
    _settings = _settings.copyWith(barcodeStickerSize: size);
    await _saveSettings();
    notifyListeners();
  }

  Future<void> updateIncludePriceOnBarcode(bool include) async {
    _settings = _settings.copyWith(includePriceOnBarcode: include);
    await _saveSettings();
    notifyListeners();
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final settingsJson = jsonEncode(_settings.toJson());
    await prefs.setString('app_settings', settingsJson);
  }

  String formatCurrency(double amount, {bool compact = false}) {
    final symbol = _settings.currency.symbol;
    
    if (compact && amount >= 100000) {
      if (amount >= 10000000) {
        return '$symbol${(amount / 10000000).toStringAsFixed(1)}Cr';
      } else if (amount >= 100000) {
        return '$symbol${(amount / 100000).toStringAsFixed(1)}L';
      }
    }
    
    return '$symbol${amount.toStringAsFixed(2).replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    )}';
  }
}
