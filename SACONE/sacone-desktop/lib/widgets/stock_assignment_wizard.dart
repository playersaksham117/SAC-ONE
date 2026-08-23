import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/warehouse.dart';
import '../models/location.dart';
import '../models/inventory_item.dart';

/// Step-by-Step Stock Assignment Wizard
/// Guides user through: Warehouse → Zone → Rack → Shelf → Bin → Item → Quantity/Batch/Expiry
class StockAssignmentWizard extends StatefulWidget {
  final List<Warehouse> warehouses;
  final List<InventoryItem> items;

  const StockAssignmentWizard({
    super.key,
    required this.warehouses,
    required this.items,
  });

  @override
  State<StockAssignmentWizard> createState() => _StockAssignmentWizardState();
}

class _StockAssignmentWizardState extends State<StockAssignmentWizard> {
  int _currentStep = 0;
  
  // Selection state
  Warehouse? _selectedWarehouse;
  Zone? _selectedZone;
  Rack? _selectedRack;
  Shelf? _selectedShelf;
  Bin? _selectedBin;
  InventoryItem? _selectedItem;
  
  // Input state
  final TextEditingController _quantityController = TextEditingController();
  final TextEditingController _batchController = TextEditingController();
  DateTime? _expiryDate;

  // Mock data - will be replaced with provider data
  List<Zone> _zones = [];
  List<Rack> _racks = [];
  List<Shelf> _shelves = [];
  List<Bin> _bins = [];

  @override
  void dispose() {
    _quantityController.dispose();
    _batchController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_currentStep < 6) {
      setState(() => _currentStep++);
    }
  }

  void _previousStep() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
    }
  }

  void _handleSave() {
    if (_selectedItem == null || _quantityController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete all required fields')),
      );
      return;
    }

    final result = {
      'warehouseId': _selectedWarehouse?.id,
      'zoneId': _selectedZone?.id,
      'rackId': _selectedRack?.id,
      'shelfId': _selectedShelf?.id,
      'binId': _selectedBin?.id,
      'itemId': _selectedItem?.id,
      'quantity': double.parse(_quantityController.text),
      'batchNumber': _batchController.text.isEmpty ? null : _batchController.text,
      'expiryDate': _expiryDate,
    };

    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        width: 800,
        height: 650,
        child: Column(
          children: [
            _buildHeader(),
            _buildStepper(),
            Expanded(child: _buildStepContent()),
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.add_location, color: Color(0xFF10B981), size: 24),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Assign Stock to Location',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Step ${_currentStep + 1} of 7',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
          const Spacer(),
          IconButton(
            icon: Icon(Icons.close, color: Colors.grey.shade600),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  Widget _buildStepper() {
    final steps = [
      'Warehouse',
      'Zone',
      'Rack',
      'Shelf',
      'Bin',
      'Item',
      'Details',
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: List.generate(steps.length, (index) {
          final isActive = index == _currentStep;
          final isCompleted = index < _currentStep;

          return Expanded(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: isCompleted
                              ? const Color(0xFF10B981)
                              : isActive
                                  ? const Color(0xFF3B82F6)
                                  : Colors.grey.shade200,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: isCompleted
                              ? const Icon(Icons.check, color: Colors.white, size: 18)
                              : Text(
                                  '${index + 1}',
                                  style: TextStyle(
                                    color: isActive ? Colors.white : Colors.grey.shade500,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        steps[index],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                          color: isActive
                              ? const Color(0xFF3B82F6)
                              : isCompleted
                                  ? const Color(0xFF10B981)
                                  : Colors.grey.shade500,
                        ),
                      ),
                    ],
                  ),
                ),
                if (index < steps.length - 1)
                  Container(
                    width: 40,
                    height: 2,
                    color: isCompleted ? const Color(0xFF10B981) : Colors.grey.shade200,
                  ),
              ],
            ),
          );
        }),
      ),
    );
  }

  Widget _buildStepContent() {
    switch (_currentStep) {
      case 0:
        return _buildWarehouseSelection();
      case 1:
        return _buildZoneSelection();
      case 2:
        return _buildRackSelection();
      case 3:
        return _buildShelfSelection();
      case 4:
        return _buildBinSelection();
      case 5:
        return _buildItemSelection();
      case 6:
        return _buildDetailsInput();
      default:
        return const SizedBox();
    }
  }

  Widget _buildWarehouseSelection() {
    return _buildSelectionStep(
      icon: Icons.warehouse,
      title: 'Select Warehouse',
      subtitle: 'Choose the warehouse where stock will be stored',
      items: widget.warehouses,
      selected: _selectedWarehouse,
      onSelect: (warehouse) {
        setState(() {
          _selectedWarehouse = warehouse;
          // Mock: Load zones for this warehouse
          _zones = _generateMockZones(warehouse.id);
          _nextStep();
        });
      },
      itemBuilder: (warehouse) => ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.warehouse, color: Color(0xFF3B82F6)),
        ),
        title: Text(
          warehouse.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(warehouse.address),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }

  Widget _buildZoneSelection() {
    return _buildLocationSelectionStep(
      icon: Icons.space_dashboard,
      title: 'Select or Create Zone',
      subtitle: 'Major area within the warehouse',
      canCreate: true,
      onCreate: () => _showCreateLocationDialog('Zone'),
      items: _zones,
      onSelect: (zone) {
        setState(() {
          _selectedZone = zone;
          _racks = _generateMockRacks(zone.id);
          _nextStep();
        });
      },
    );
  }

  Widget _buildRackSelection() {
    return _buildLocationSelectionStep(
      icon: Icons.view_week,
      title: 'Select or Create Rack',
      subtitle: 'Storage rack within the zone',
      canCreate: true,
      onCreate: () => _showCreateLocationDialog('Rack'),
      items: _racks,
      onSelect: (rack) {
        setState(() {
          _selectedRack = rack;
          _shelves = _generateMockShelves(rack.id);
          _nextStep();
        });
      },
    );
  }

  Widget _buildShelfSelection() {
    return _buildLocationSelectionStep(
      icon: Icons.horizontal_split,
      title: 'Select or Create Shelf',
      subtitle: 'Shelf level within the rack',
      canCreate: true,
      onCreate: () => _showCreateLocationDialog('Shelf'),
      items: _shelves,
      onSelect: (shelf) {
        setState(() {
          _selectedShelf = shelf;
          _bins = _generateMockBins(shelf.id);
          _nextStep();
        });
      },
    );
  }

  Widget _buildBinSelection() {
    return _buildLocationSelectionStep(
      icon: Icons.inbox,
      title: 'Select or Create Bin/Cell',
      subtitle: 'Exact storage location',
      canCreate: true,
      onCreate: () => _showCreateLocationDialog('Bin'),
      items: _bins,
      onSelect: (bin) {
        setState(() {
          _selectedBin = bin;
          _nextStep();
        });
      },
    );
  }

  Widget _buildItemSelection() {
    return _buildSelectionStep(
      icon: Icons.inventory_2,
      title: 'Select Item',
      subtitle: 'Choose the product to store',
      items: widget.items,
      selected: _selectedItem,
      onSelect: (item) {
        setState(() {
          _selectedItem = item;
          _nextStep();
        });
      },
      itemBuilder: (item) => ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.inventory_2, color: Color(0xFF8B5CF6)),
        ),
        title: Text(
          item.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text('SKU: ${item.sku} • ${item.unit}'),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }

  Widget _buildDetailsInput() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildLocationSummary(),
          const SizedBox(height: 32),
          _buildTextField(
            'Quantity',
            _quantityController,
            required: true,
            keyboardType: TextInputType.number,
            suffix: _selectedItem?.unit ?? '',
          ),
          const SizedBox(height: 16),
          _buildTextField(
            'Batch Number (Optional)',
            _batchController,
          ),
          const SizedBox(height: 16),
          _buildDatePicker(),
        ],
      ),
    );
  }

  Widget _buildLocationSummary() {
    final path = LocationPath(
      warehouseName: _selectedWarehouse?.name,
      zoneName: _selectedZone?.name,
      rackName: _selectedRack?.name,
      shelfName: _selectedShelf?.name,
      binName: _selectedBin?.name,
    );

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF10B981).withValues(alpha: 0.1),
            const Color(0xFF10B981).withValues(alpha: 0.05),
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.location_on, color: Color(0xFF10B981), size: 20),
              SizedBox(width: 8),
              Text(
                'Stock Location',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            path.fullPath,
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFF0F172A),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          if (_selectedItem != null)
            Row(
              children: [
                const Icon(Icons.inventory_2, color: Color(0xFF10B981), size: 18),
                const SizedBox(width: 8),
                Text(
                  _selectedItem!.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildTextField(
    String label,
    TextEditingController controller, {
    bool required = false,
    TextInputType? keyboardType,
    String? suffix,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
            if (required)
              const Text(
                ' *',
                style: TextStyle(color: Color(0xFFEF4444), fontSize: 14, fontWeight: FontWeight.w600),
              ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: keyboardType == TextInputType.number
              ? [FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}'))]
              : null,
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            suffixText: suffix,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
      ],
    );
  }

  Widget _buildDatePicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Expiry Date (Optional)',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade700,
          ),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: () async {
            final date = await showDatePicker(
              context: context,
              initialDate: _expiryDate ?? DateTime.now().add(const Duration(days: 365)),
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 3650)),
            );
            if (date != null) {
              setState(() => _expiryDate = date);
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0), width: 2),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today, color: Color(0xFF64748B), size: 18),
                const SizedBox(width: 12),
                Text(
                  _expiryDate != null
                      ? '${_expiryDate!.day}/${_expiryDate!.month}/${_expiryDate!.year}'
                      : 'Select expiry date',
                  style: TextStyle(
                    color: _expiryDate != null ? const Color(0xFF0F172A) : Colors.grey.shade400,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSelectionStep<T>({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<T> items,
    required T? selected,
    required Function(T) onSelect,
    required Widget Function(T) itemBuilder,
  }) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(icon, size: 48, color: const Color(0xFF3B82F6)),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            itemCount: items.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              return InkWell(
                onTap: () => onSelect(items[index]),
                child: itemBuilder(items[index]),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildLocationSelectionStep<T>({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool canCreate,
    required VoidCallback onCreate,
    required List<T> items,
    required Function(T) onSelect,
  }) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Icon(icon, size: 48, color: const Color(0xFF10B981)),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ),
        if (canCreate)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: OutlinedButton.icon(
              onPressed: onCreate,
              icon: const Icon(Icons.add),
              label: const Text('Create New'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(double.infinity, 48),
              ),
            ),
          ),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            itemCount: items.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final item = items[index];
              final name = (item is Zone || item is Rack || item is Shelf || item is Bin)
                  ? (item as dynamic).name
                  : '';
              
              return ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: const Color(0xFF10B981)),
                ),
                title: Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => onSelect(item),
              );
            },
          ),
        ),
      ],
    );
  }

  void _showCreateLocationDialog(String type) {
    // Placeholder for creating new location
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Create $type'),
        content: TextField(
          decoration: InputDecoration(
            labelText: '$type Name',
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              // TODO: Create location
              Navigator.pop(context);
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: [
          if (_currentStep > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: _previousStep,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  side: BorderSide(color: Colors.grey.shade300, width: 2),
                ),
                child: const Text('Back'),
              ),
            ),
          if (_currentStep > 0) const SizedBox(width: 16),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: _currentStep == 6 ? _handleSave : null,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: const Color(0xFF10B981),
              ),
              child: const Text('Save Stock Assignment'),
            ),
          ),
        ],
      ),
    );
  }

  // Mock data generators (will be replaced with real data from provider)
  List<Zone> _generateMockZones(String warehouseId) {
    return [
      Zone(
        id: 'zone1',
        warehouseId: warehouseId,
        name: 'Zone A - Front',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Zone(
        id: 'zone2',
        warehouseId: warehouseId,
        name: 'Zone B - Back',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    ];
  }

  List<Rack> _generateMockRacks(String zoneId) {
    return [
      Rack(
        id: 'rack1',
        zoneId: zoneId,
        name: 'Rack 1',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Rack(
        id: 'rack2',
        zoneId: zoneId,
        name: 'Rack 2',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    ];
  }

  List<Shelf> _generateMockShelves(String rackId) {
    return [
      Shelf(
        id: 'shelf1',
        rackId: rackId,
        name: 'Shelf 1 (Top)',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Shelf(
        id: 'shelf2',
        rackId: rackId,
        name: 'Shelf 2 (Middle)',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Shelf(
        id: 'shelf3',
        rackId: rackId,
        name: 'Shelf 3 (Bottom)',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    ];
  }

  List<Bin> _generateMockBins(String shelfId) {
    return [
      Bin(
        id: 'bin1',
        shelfId: shelfId,
        name: 'Bin A',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Bin(
        id: 'bin2',
        shelfId: shelfId,
        name: 'Bin B',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      Bin(
        id: 'bin3',
        shelfId: shelfId,
        name: 'Bin C',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    ];
  }
}
