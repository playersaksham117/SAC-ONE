/// ============================================================
/// LOCATIONS SCREEN - Warehouse and location management
/// ============================================================
/// 
/// Hierarchical view of warehouses and storage locations.
/// Tree view for zone/rack/shelf/bin navigation.
/// ============================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/wms_providers.dart';
import '../domain/entities/warehouse.dart';

class LocationsScreen extends StatefulWidget {
  const LocationsScreen({super.key});

  @override
  State<LocationsScreen> createState() => _LocationsScreenState();
}

class _LocationsScreenState extends State<LocationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<WarehouseProvider>();
      if (provider.warehouses.isEmpty) {
        provider.loadWarehouses();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Locations'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<WarehouseProvider>().loadWarehouses();
            },
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Consumer<WarehouseProvider>(
        builder: (context, warehouse, _) {
          if (warehouse.isLoading && warehouse.warehouses.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          
          return Row(
            children: [
              // Warehouse list sidebar
              SizedBox(
                width: 280,
                child: _WarehouseList(
                  warehouses: warehouse.warehouses,
                  selectedWarehouse: warehouse.selectedWarehouse,
                  onWarehouseSelected: (wh) => warehouse.selectWarehouse(wh),
                  onAddWarehouse: () => _showWarehouseDialog(),
                ),
              ),
              
              VerticalDivider(
                width: 1,
                thickness: 1,
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
              
              // Location tree
              Expanded(
                child: warehouse.selectedWarehouse == null
                    ? _SelectWarehousePrompt()
                    : _LocationTreeView(
                        warehouse: warehouse.selectedWarehouse!,
                        locations: warehouse.locations,
                        onLocationSelected: (loc) => warehouse.selectLocation(loc),
                        selectedLocation: warehouse.selectedLocation,
                        onAddLocation: () => _showLocationDialog(),
                        onAddStructure: () => _showStructureDialog(),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showWarehouseDialog({Warehouse? warehouse}) {
    showDialog(
      context: context,
      builder: (context) => _WarehouseFormDialog(warehouse: warehouse),
    );
  }

  void _showLocationDialog({StorageLocation? location}) {
    showDialog(
      context: context,
      builder: (context) => _LocationFormDialog(location: location),
    );
  }

  void _showStructureDialog() {
    showDialog(
      context: context,
      builder: (context) => const _StructureFormDialog(),
    );
  }
}

class _WarehouseList extends StatelessWidget {
  final List<Warehouse> warehouses;
  final Warehouse? selectedWarehouse;
  final Function(Warehouse) onWarehouseSelected;
  final VoidCallback onAddWarehouse;
  
  const _WarehouseList({
    required this.warehouses,
    required this.selectedWarehouse,
    required this.onWarehouseSelected,
    required this.onAddWarehouse,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Warehouses',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.add, size: 20),
                onPressed: onAddWarehouse,
                tooltip: 'Add Warehouse',
                style: IconButton.styleFrom(
                  backgroundColor: colorScheme.primaryContainer,
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: warehouses.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.warehouse_outlined,
                          size: 48,
                          color: colorScheme.outline,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No warehouses',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colorScheme.outline,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: onAddWarehouse,
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Add First'),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  itemCount: warehouses.length,
                  itemBuilder: (context, index) {
                    final wh = warehouses[index];
                    final isSelected = wh.id == selectedWarehouse?.id;
                    
                    return ListTile(
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: isSelected 
                              ? colorScheme.primaryContainer
                              : colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.warehouse,
                          size: 20,
                          color: isSelected 
                              ? colorScheme.primary
                              : colorScheme.onSurfaceVariant,
                        ),
                      ),
                      title: Text(
                        wh.name,
                        style: TextStyle(
                          fontWeight: isSelected ? FontWeight.w600 : null,
                        ),
                      ),
                      subtitle: wh.city != null 
                          ? Text(wh.city!, maxLines: 1, overflow: TextOverflow.ellipsis)
                          : null,
                      selected: isSelected,
                      selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.3),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      onTap: () => onWarehouseSelected(wh),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _SelectWarehousePrompt extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.arrow_back,
            size: 48,
            color: colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            'Select a warehouse',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colorScheme.outline,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Choose a warehouse from the sidebar to view locations',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: colorScheme.outline.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationTreeView extends StatelessWidget {
  final Warehouse warehouse;
  final List<StorageLocation> locations;
  final Function(StorageLocation) onLocationSelected;
  final StorageLocation? selectedLocation;
  final VoidCallback onAddLocation;
  final VoidCallback onAddStructure;
  
  const _LocationTreeView({
    required this.warehouse,
    required this.locations,
    required this.onLocationSelected,
    required this.selectedLocation,
    required this.onAddLocation,
    required this.onAddStructure,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    // Build hierarchical tree
    final rootLocations = locations.where((l) => l.parentId == null).toList();
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    warehouse.name,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '${locations.length} locations',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.outline,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: onAddStructure,
                    icon: const Icon(Icons.account_tree, size: 18),
                    label: const Text('Add Structure'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: onAddLocation,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Add Location'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        
        // Location tree
        Expanded(
          child: locations.isEmpty
              ? _EmptyLocations(
                  onAddLocation: onAddLocation,
                  onAddStructure: onAddStructure,
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: rootLocations.length,
                  itemBuilder: (context, index) {
                    return _LocationTreeItem(
                      location: rootLocations[index],
                      allLocations: locations,
                      selectedLocation: selectedLocation,
                      onSelected: onLocationSelected,
                      depth: 0,
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _EmptyLocations extends StatelessWidget {
  final VoidCallback onAddLocation;
  final VoidCallback onAddStructure;
  
  const _EmptyLocations({
    required this.onAddLocation,
    required this.onAddStructure,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.location_on_outlined,
              size: 64,
              color: colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              'No locations defined',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: colorScheme.outline,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Create a location structure to organize stock',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colorScheme.outline.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                OutlinedButton.icon(
                  onPressed: onAddStructure,
                  icon: const Icon(Icons.account_tree),
                  label: const Text('Create Structure'),
                ),
                const SizedBox(width: 16),
                FilledButton.icon(
                  onPressed: onAddLocation,
                  icon: const Icon(Icons.add),
                  label: const Text('Add Location'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LocationTreeItem extends StatefulWidget {
  final StorageLocation location;
  final List<StorageLocation> allLocations;
  final StorageLocation? selectedLocation;
  final Function(StorageLocation) onSelected;
  final int depth;
  
  const _LocationTreeItem({
    required this.location,
    required this.allLocations,
    required this.selectedLocation,
    required this.onSelected,
    required this.depth,
  });

  @override
  State<_LocationTreeItem> createState() => _LocationTreeItemState();
}

class _LocationTreeItemState extends State<_LocationTreeItem> {
  bool _isExpanded = true;

  List<StorageLocation> get _children =>
      widget.allLocations.where((l) => l.parentId == widget.location.id).toList();

  bool get _hasChildren => _children.isNotEmpty;

  IconData get _typeIcon => switch (widget.location.type) {
    LocationType.warehouse => Icons.warehouse,
    LocationType.zone => Icons.grid_view,
    LocationType.rack => Icons.view_column,
    LocationType.shelf => Icons.view_agenda,
    LocationType.bin => Icons.all_inbox,
  };

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isSelected = widget.selectedLocation?.id == widget.location.id;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => widget.onSelected(widget.location),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            margin: EdgeInsets.only(left: widget.depth * 24.0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? colorScheme.primaryContainer : null,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                // Expand/collapse button
                if (_hasChildren)
                  IconButton(
                    icon: Icon(
                      _isExpanded ? Icons.expand_more : Icons.chevron_right,
                      size: 20,
                    ),
                    onPressed: () => setState(() => _isExpanded = !_isExpanded),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  )
                else
                  const SizedBox(width: 28),
                
                // Type icon
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: isSelected 
                        ? colorScheme.primary.withValues(alpha: 0.2)
                        : colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Icon(
                    _typeIcon,
                    size: 16,
                    color: isSelected ? colorScheme.primary : colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: 12),
                
                // Location info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.location.name,
                        style: TextStyle(
                          fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                        ),
                      ),
                      Text(
                        '${widget.location.type.name.toUpperCase()} ${widget.location.code != null ? '• ${widget.location.code}' : ''}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Actions
                if (isSelected) ...[
                  IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    onPressed: () {
                      // Edit location
                    },
                    tooltip: 'Edit',
                  ),
                  IconButton(
                    icon: Icon(Icons.delete_outline, size: 18, color: colorScheme.error),
                    onPressed: () {
                      // Delete location
                    },
                    tooltip: 'Delete',
                  ),
                ],
              ],
            ),
          ),
        ),
        
        // Children
        if (_isExpanded && _hasChildren)
          ..._children.map((child) => _LocationTreeItem(
            location: child,
            allLocations: widget.allLocations,
            selectedLocation: widget.selectedLocation,
            onSelected: widget.onSelected,
            depth: widget.depth + 1,
          )),
      ],
    );
  }
}

// ============================================================
// DIALOGS
// ============================================================

class _WarehouseFormDialog extends StatefulWidget {
  final Warehouse? warehouse;
  
  const _WarehouseFormDialog({this.warehouse});

  @override
  State<_WarehouseFormDialog> createState() => _WarehouseFormDialogState();
}

class _WarehouseFormDialogState extends State<_WarehouseFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _codeController;
  late final TextEditingController _addressController;
  late final TextEditingController _cityController;
  
  bool _isLoading = false;
  bool get isEditing => widget.warehouse != null;

  @override
  void initState() {
    super.initState();
    final wh = widget.warehouse;
    _nameController = TextEditingController(text: wh?.name ?? '');
    _codeController = TextEditingController(text: wh?.code ?? '');
    _addressController = TextEditingController(text: wh?.address ?? '');
    _cityController = TextEditingController(text: wh?.city ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);
    
    final provider = context.read<WarehouseProvider>();
    
    if (isEditing) {
      await provider.updateWarehouse(
        widget.warehouse!.id,
        name: _nameController.text.trim(),
        address: _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
        city: _cityController.text.trim().isEmpty ? null : _cityController.text.trim(),
      );
    } else {
      await provider.createWarehouse(
        name: _nameController.text.trim(),
        code: _codeController.text.trim().isEmpty ? null : _codeController.text.trim(),
        address: _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
        city: _cityController.text.trim().isEmpty ? null : _cityController.text.trim(),
      );
    }
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(isEditing ? 'Edit Warehouse' : 'Add Warehouse'),
      content: SizedBox(
        width: 400,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name *',
                  hintText: 'Enter warehouse name',
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Name is required';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _codeController,
                decoration: InputDecoration(
                  labelText: 'Code',
                  hintText: 'Auto-generated if empty',
                  enabled: !isEditing,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Address',
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _cityController,
                decoration: const InputDecoration(
                  labelText: 'City',
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleSubmit,
          child: _isLoading
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(isEditing ? 'Update' : 'Create'),
        ),
      ],
    );
  }
}

class _LocationFormDialog extends StatefulWidget {
  final StorageLocation? location;
  
  const _LocationFormDialog({this.location});

  @override
  State<_LocationFormDialog> createState() => _LocationFormDialogState();
}

class _LocationFormDialogState extends State<_LocationFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _codeController;
  late final TextEditingController _barcodeController;
  
  LocationType _selectedType = LocationType.zone;
  bool _isPickable = true;
  bool _isLoading = false;
  
  bool get isEditing => widget.location != null;

  @override
  void initState() {
    super.initState();
    final loc = widget.location;
    _nameController = TextEditingController(text: loc?.name ?? '');
    _codeController = TextEditingController(text: loc?.code ?? '');
    _barcodeController = TextEditingController(text: loc?.barcode ?? '');
    if (loc != null) {
      _selectedType = loc.type;
      _isPickable = loc.isPickable;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _barcodeController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);
    
    final provider = context.read<WarehouseProvider>();
    
    if (isEditing) {
      await provider.updateLocation(
        widget.location!.id,
        name: _nameController.text.trim(),
        barcode: _barcodeController.text.trim().isEmpty ? null : _barcodeController.text.trim(),
        isPickable: _isPickable,
      );
    } else {
      await provider.createLocation(
        name: _nameController.text.trim(),
        type: _selectedType,
        code: _codeController.text.trim().isEmpty ? null : _codeController.text.trim(),
        barcode: _barcodeController.text.trim().isEmpty ? null : _barcodeController.text.trim(),
        isPickable: _isPickable,
      );
    }
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(isEditing ? 'Edit Location' : 'Add Location'),
      content: SizedBox(
        width: 400,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name *',
                  hintText: 'Enter location name',
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Name is required';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              if (!isEditing)
                DropdownButtonFormField<LocationType>(
                  value: _selectedType,
                  decoration: const InputDecoration(
                    labelText: 'Type *',
                  ),
                  items: LocationType.values.map((type) {
                    return DropdownMenuItem(
                      value: type,
                      child: Text(type.name.toUpperCase()),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => _selectedType = value);
                    }
                  },
                ),
              if (!isEditing) const SizedBox(height: 16),
              
              TextFormField(
                controller: _codeController,
                decoration: const InputDecoration(
                  labelText: 'Code',
                  hintText: 'Optional code',
                ),
              ),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _barcodeController,
                decoration: const InputDecoration(
                  labelText: 'Barcode',
                  hintText: 'Optional barcode',
                ),
              ),
              const SizedBox(height: 16),
              
              SwitchListTile(
                title: const Text('Pickable'),
                subtitle: const Text('Can stock be picked from this location?'),
                value: _isPickable,
                onChanged: (value) => setState(() => _isPickable = value),
                contentPadding: EdgeInsets.zero,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleSubmit,
          child: _isLoading
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(isEditing ? 'Update' : 'Create'),
        ),
      ],
    );
  }
}

class _StructureFormDialog extends StatefulWidget {
  const _StructureFormDialog();

  @override
  State<_StructureFormDialog> createState() => _StructureFormDialogState();
}

class _StructureFormDialogState extends State<_StructureFormDialog> {
  final _formKey = GlobalKey<FormState>();
  final _zoneNameController = TextEditingController();
  final _zoneCodeController = TextEditingController();
  
  int _rackCount = 4;
  int _shelvesPerRack = 5;
  int _binsPerShelf = 6;
  bool _isLoading = false;

  @override
  void dispose() {
    _zoneNameController.dispose();
    _zoneCodeController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);
    
    final provider = context.read<WarehouseProvider>();
    
    await provider.createLocationStructure(
      zoneName: _zoneNameController.text.trim(),
      zoneCode: _zoneCodeController.text.trim().isEmpty ? null : _zoneCodeController.text.trim(),
      rackCount: _rackCount,
      shelvesPerRack: _shelvesPerRack,
      binsPerShelf: _binsPerShelf,
    );
    
    setState(() => _isLoading = false);
    
    if (mounted) {
      Navigator.pop(context);
    }
  }

  int get _totalLocations => 1 + _rackCount + (_rackCount * _shelvesPerRack) + (_rackCount * _shelvesPerRack * _binsPerShelf);

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    
    return AlertDialog(
      title: const Text('Create Location Structure'),
      content: SizedBox(
        width: 450,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This will create a complete zone structure with racks, shelves, and bins.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colorScheme.outline,
                ),
              ),
              const SizedBox(height: 24),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _zoneNameController,
                      decoration: const InputDecoration(
                        labelText: 'Zone Name *',
                        hintText: 'e.g., Zone A',
                      ),
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Name is required';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _zoneCodeController,
                      decoration: const InputDecoration(
                        labelText: 'Zone Code',
                        hintText: 'e.g., A',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              _NumberSelector(
                label: 'Racks per zone',
                value: _rackCount,
                min: 1,
                max: 20,
                onChanged: (v) => setState(() => _rackCount = v),
              ),
              const SizedBox(height: 16),
              
              _NumberSelector(
                label: 'Shelves per rack',
                value: _shelvesPerRack,
                min: 1,
                max: 10,
                onChanged: (v) => setState(() => _shelvesPerRack = v),
              ),
              const SizedBox(height: 16),
              
              _NumberSelector(
                label: 'Bins per shelf',
                value: _binsPerShelf,
                min: 1,
                max: 20,
                onChanged: (v) => setState(() => _binsPerShelf = v),
              ),
              const SizedBox(height: 24),
              
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: colorScheme.primary),
                    const SizedBox(width: 12),
                    Text(
                      'This will create $_totalLocations locations',
                      style: TextStyle(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleSubmit,
          child: _isLoading
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Create Structure'),
        ),
      ],
    );
  }
}

class _NumberSelector extends StatelessWidget {
  final String label;
  final int value;
  final int min;
  final int max;
  final Function(int) onChanged;
  
  const _NumberSelector({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label),
        ),
        IconButton(
          icon: const Icon(Icons.remove),
          onPressed: value > min ? () => onChanged(value - 1) : null,
        ),
        Container(
          width: 48,
          alignment: Alignment.center,
          child: Text(
            '$value',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        IconButton(
          icon: const Icon(Icons.add),
          onPressed: value < max ? () => onChanged(value + 1) : null,
        ),
      ],
    );
  }
}
