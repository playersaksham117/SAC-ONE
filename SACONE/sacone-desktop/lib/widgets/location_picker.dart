import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/warehouse_provider.dart';

class LocationPickerWidget extends StatefulWidget {
  final Function(String? warehouseId, String? zoneId, String? rackId, String? shelfId, String? binId) onLocationSelected;
  final bool showBinLevel;
  final bool showShelfLevel;

  const LocationPickerWidget({
    super.key,
    required this.onLocationSelected,
    this.showBinLevel = true,
    this.showShelfLevel = true,
  });

  @override
  State<LocationPickerWidget> createState() => _LocationPickerWidgetState();
}

class _LocationPickerWidgetState extends State<LocationPickerWidget> {
  String? selectedWarehouseId;
  String? selectedZoneId;
  String? selectedRackId;
  String? selectedShelfId;
  String? selectedBinId;

  List<Map<String, dynamic>> zones = [];
  List<Map<String, dynamic>> racks = [];
  List<Map<String, dynamic>> shelves = [];
  List<Map<String, dynamic>> bins = [];

  void _onWarehouseChanged(String? id) {
    setState(() {
      selectedWarehouseId = id;
      selectedZoneId = null;
      selectedRackId = null;
      selectedShelfId = null;
      selectedBinId = null;
      zones = [];
      racks = [];
      shelves = [];
      bins = [];
    });

    if (id != null) {
      final warehouseProvider = context.read<WarehouseProvider>();
      warehouseProvider.loadStorageLocations(id).then((_) {
        setState(() {
          zones = warehouseProvider.locations
              .map((loc) => {
                'id': loc.zoneId,
                'name': loc.zoneName,
              })
              .toList()
              .cast<Map<String, dynamic>>();
        });
      });
    }

    widget.onLocationSelected(id, null, null, null, null);
  }

  void _onZoneChanged(String? id) {
    setState(() {
      selectedZoneId = id;
      selectedRackId = null;
      selectedShelfId = null;
      selectedBinId = null;
      racks = [];
      shelves = [];
      bins = [];
    });

    if (id != null && selectedWarehouseId != null) {
      setState(() {
        racks = [];
      });
    }

    widget.onLocationSelected(selectedWarehouseId, id, null, null, null);
  }

  void _onRackChanged(String? id) {
    setState(() {
      selectedRackId = id;
      selectedShelfId = null;
      selectedBinId = null;
      shelves = [];
      bins = [];
    });

    if (id != null && selectedZoneId != null) {
      setState(() {
        shelves = [];
      });
    }

    widget.onLocationSelected(selectedWarehouseId, selectedZoneId, id, null, null);
  }

  void _onShelfChanged(String? id) {
    setState(() {
      selectedShelfId = id;
      selectedBinId = null;
      bins = [];
    });

    if (id != null && selectedRackId != null && widget.showBinLevel) {
      setState(() {
        bins = [];
      });
    }

    widget.onLocationSelected(selectedWarehouseId, selectedZoneId, selectedRackId, id, null);
  }

  void _onBinChanged(String? id) {
    setState(() {
      selectedBinId = id;
    });

    widget.onLocationSelected(selectedWarehouseId, selectedZoneId, selectedRackId, selectedShelfId, id);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<WarehouseProvider>(
      builder: (context, warehouseProvider, _) {
        return Column(
          children: [
            // Warehouse Dropdown
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Warehouse *',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: selectedWarehouseId,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      hintText: 'Select warehouse',
                    ),
                    items: warehouseProvider.warehouses.map((warehouse) {
                      return DropdownMenuItem<String>(
                        value: warehouse.id,
                        child: Text(warehouse.name),
                      );
                    }).toList(),
                    onChanged: _onWarehouseChanged,
                  ),
                ],
              ),
            ),

            // Zone Dropdown
            if (selectedWarehouseId != null) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Zone',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: selectedZoneId,
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        hintText: 'Select zone',
                      ),
                      items: zones.map((zone) {
                        return DropdownMenuItem<String>(
                          value: zone['id'],
                          child: Text(zone['name']),
                        );
                      }).toList(),
                      onChanged: _onZoneChanged,
                    ),
                  ],
                ),
              ),
            ],

            // Rack Dropdown
            if (selectedZoneId != null) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Rack',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: selectedRackId,
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        hintText: 'Select rack',
                      ),
                      items: racks.map((rack) {
                        return DropdownMenuItem<String>(
                          value: rack['id'],
                          child: Text(rack['name']),
                        );
                      }).toList(),
                      onChanged: _onRackChanged,
                    ),
                  ],
                ),
              ),
            ],

            // Shelf Dropdown
            if (selectedRackId != null && widget.showShelfLevel) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Shelf',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: selectedShelfId,
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        hintText: 'Select shelf',
                      ),
                      items: shelves.map((shelf) {
                        return DropdownMenuItem<String>(
                          value: shelf['id'],
                          child: Text(shelf['name']),
                        );
                      }).toList(),
                      onChanged: _onShelfChanged,
                    ),
                  ],
                ),
              ),
            ],

            // Bin Dropdown
            if (selectedShelfId != null && widget.showBinLevel) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bin',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: selectedBinId,
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        hintText: 'Select bin',
                      ),
                      items: bins.map((bin) {
                        return DropdownMenuItem<String>(
                          value: bin['id'],
                          child: Text(bin['name']),
                        );
                      }).toList(),
                      onChanged: _onBinChanged,
                    ),
                  ],
                ),
              ),
            ],

            // Location Path Display
            if (selectedWarehouseId != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  border: Border.all(color: Colors.blue[200]!),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.location_on, size: 16, color: Colors.blue[700]),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _buildLocationPath(),
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.blue[900],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  String _buildLocationPath() {
    final parts = <String>[];

    if (selectedWarehouseId != null) {
      try {
        final warehouse = context
            .read<WarehouseProvider>()
            .warehouses
            .firstWhere((w) => w.id == selectedWarehouseId);
        parts.add(warehouse.name);
      } catch (e) {
        // Warehouse not found
      }
    }

    if (selectedZoneId != null) {
      final zone =
          zones.firstWhere((z) => z['id'] == selectedZoneId, orElse: () => {});
      if (zone.isNotEmpty) {
        parts.add(zone['name'] ?? '');
      }
    }

    if (selectedRackId != null) {
      final rack =
          racks.firstWhere((r) => r['id'] == selectedRackId, orElse: () => {});
      if (rack.isNotEmpty) {
        parts.add(rack['name'] ?? '');
      }
    }

    if (selectedShelfId != null && widget.showShelfLevel) {
      final shelf = shelves.firstWhere((s) => s['id'] == selectedShelfId, orElse: () => {});
      if (shelf.isNotEmpty) {
        parts.add(shelf['name'] ?? '');
      }
    }

    if (selectedBinId != null && widget.showBinLevel) {
      final bin = bins.firstWhere((b) => b['id'] == selectedBinId, orElse: () => {});
      if (bin.isNotEmpty) {
        parts.add(bin['name'] ?? '');
      }
    }

    return parts.join(' / ');
  }
}
