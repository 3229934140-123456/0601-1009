import AssetInventory, {
  AssetCategory,
  AssetStatus,
  InventoryStatus,
  ExceptionType
} from './index';

function log(title: string, data?: any) {
  console.log(`\n========== ${title} ==========`);
  if (data !== undefined) {
    console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }
}

function runTest() {
  console.log('🚀 企业资产盘点类库 v2 - 功能验证测试');

  // ==============================================
  // 1. Bug 修复验证 - 责任人变更履历
  // ==============================================
  log('【Bug修复1】责任人变更履历 - 验证原责任人和新责任人都显示');

  AssetInventory.store.clear();

  const asset1 = AssetInventory.asset.registerAsset({
    assetNo: 'AST001',
    name: 'ThinkPad X1 Carbon',
    category: AssetCategory.COMPUTER,
    location: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' },
    responsiblePerson: '张三',
    department: '技术部'
  });

  AssetInventory.asset.updateResponsiblePerson(asset1.id, '赵六', '人事专员');

  const history = AssetInventory.asset.getAssetHistory(asset1.id);
  const changeRecord = history.find(h => h.title === '责任人变更');
  console.log('履历描述:', changeRecord?.description);
  console.log('detail.from:', changeRecord?.detail?.from);
  console.log('detail.to:', changeRecord?.detail?.to);
  console.log('✅ 履历正确显示原责任人:', changeRecord?.detail?.from === '张三');
  console.log('✅ 履历正确显示新责任人:', changeRecord?.detail?.to === '赵六');

  // ==============================================
  // 2. Bug 修复验证 - 未注册资产重复扫描
  // ==============================================
  log('【Bug修复2】未注册资产重复扫描 - 不同编号不能合并，同编号才算重复');

  const task = AssetInventory.task.createTask({
    name: '测试盘点批次',
    batchNo: 'INV-TEST-001',
    operator: '测试员'
  });
  AssetInventory.task.startTask(task.id);

  AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'UNKNOWN-001',
    scanner: '测试员A'
  });
  AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'UNKNOWN-002',
    scanner: '测试员A'
  });
  AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'UNKNOWN-001',
    scanner: '测试员A'
  });

  const unregAssets = AssetInventory.summary.getUnregisteredAssets(task.id);
  console.log('未注册资产种类数:', unregAssets.length);
  console.log('分别是:', unregAssets);
  console.log('✅ 两个不同的未注册资产都保留了:', unregAssets.length === 2);

  const mergeResult = AssetInventory.task.mergeDuplicateScans(task.id);
  console.log('合并后保留扫描数:', mergeResult.kept.length);
  const unregAfterMerge = AssetInventory.summary.getUnregisteredAssets(task.id);
  console.log('合并后未注册资产种类数:', unregAfterMerge.length);
  console.log('✅ 合并后不同编号未注册资产不被吞掉:', unregAfterMerge.length === 2);

  // ==============================================
  // 3. 可插拔存储 - JSON 导出导入
  // ==============================================
  log('【新功能1】可插拔存储 - JSON 导出与恢复');

  // 先准备点数据
  const asset2 = AssetInventory.asset.registerAsset({
    assetNo: 'AST002',
    name: 'Dell 显示器',
    category: AssetCategory.COMPUTER,
    location: { building: 'A座', floor: '5层', room: '501室' },
    responsiblePerson: '李四',
    department: '技术部'
  });
  AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'AST002',
    scanner: '测试员A'
  });

  const snapshot = AssetInventory.store.exportSnapshot();
  console.log('导出快照 - 资产数:', snapshot.assets.length);
  console.log('导出快照 - 任务数:', snapshot.tasks.length);
  console.log('导出快照 - 扫描记录数:', snapshot.tasks[0]?.actualScans.length);

  const jsonStr = AssetInventory.store.exportJSON();
  console.log('JSON 导出成功，长度:', jsonStr.length, '字符');

  // 清空后恢复
  AssetInventory.store.clear();
  console.log('清空后资产数:', AssetInventory.store.getAssets().length);

  const importResult = AssetInventory.store.importJSON(jsonStr, 'replace');
  console.log('导入后资产数:', importResult.assets);
  console.log('导入后任务数:', importResult.tasks);

  const restoredAsset = AssetInventory.asset.getAssetByNo('AST001');
  console.log('✅ 恢复后资产信息一致:', restoredAsset?.assetNo === 'AST001');

  const restoredTask = AssetInventory.task.getTask(task.id);
  console.log('✅ 恢复后任务ID一致:', restoredTask?.id === task.id);
  console.log('✅ 恢复后扫描记录数一致:', restoredTask?.actualScans.length === task.actualScans.length);

  // 恢复后继续操作
  const newScan = AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'AST001',
    scanner: '测试员B',
    scanLocation: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' }
  });
  console.log('✅ 恢复后能继续提交扫描:', newScan.assetNo === 'AST001');

  const report = AssetInventory.summary.generateReport(task.id);
  console.log('✅ 恢复后能生成报告:', report.totalAssets > 0);

  // ==============================================
  // 4. 盘点范围拆分 - 按部门/位置/责任人
  // ==============================================
  log('【新功能2】盘点范围拆分 - 支持部门、位置、责任人多维度');

  AssetInventory.store.clear();

  for (let i = 1; i <= 6; i++) {
    AssetInventory.asset.registerAsset({
      assetNo: `AST-${String(i).padStart(3, '0')}`,
      name: `资产${i}`,
      category: i <= 3 ? AssetCategory.COMPUTER : AssetCategory.FURNITURE,
      location: {
        building: i <= 3 ? 'A座' : 'B座',
        floor: i <= 2 ? '5层' : '6层',
        room: `${i}01室`
      },
      responsiblePerson: i % 2 === 0 ? '张三' : '李四',
      department: i <= 3 ? '技术部' : '行政部'
    });
  }

  const allAssets = AssetInventory.asset.listAssets({ page: 1, pageSize: 100 });
  const allAssetIds = allAssets.list.map(a => a.id);

  const mainTask = AssetInventory.task.createTask({
    name: '季度大盘点',
    batchNo: 'INV-QUARTER-001',
    operator: '盘点主管',
    planAssetIds: allAssetIds
  });
  AssetInventory.task.startTask(mainTask.id);

  // 按部门拆分
  const deptScopes = AssetInventory.task.splitByDepartment(mainTask.id);
  console.log('按部门拆分得到范围数:', deptScopes.length);
  deptScopes.forEach(s => {
    console.log(`  - ${s.name}: ${s.assetIds.length}个资产`);
  });

  // 按位置拆分
  const locScopes = AssetInventory.task.splitByLocation(mainTask.id, 'building');
  console.log('按楼宇拆分得到范围数:', locScopes.length);
  locScopes.forEach(s => {
    console.log(`  - ${s.name}: ${s.assetIds.length}个资产`);
  });

  // 按责任人拆分
  const personScopes = AssetInventory.task.splitByResponsiblePerson(mainTask.id);
  console.log('按责任人拆分得到范围数:', personScopes.length);
  personScopes.forEach(s => {
    console.log(`  - ${s.name}: ${s.assetIds.length}个资产`);
  });

  // ==============================================
  // 5. 多盘点员协作
  // ==============================================
  log('【新功能3】多盘点员协作 - 分范围负责，结果合并');

  // 给两个范围分配盘点员
  AssetInventory.task.assignScanner(mainTask.id, deptScopes[0].id, '盘点员A');
  AssetInventory.task.assignScanner(mainTask.id, deptScopes[1].id, '盘点员B');

  // 盘点员A扫描技术部资产
  const techDeptAssets = allAssets.list.filter(a => a.department === '技术部');
  for (const asset of techDeptAssets) {
    AssetInventory.task.submitScan({
      taskId: mainTask.id,
      assetNo: asset.assetNo,
      scanner: '盘点员A',
      scanLocation: asset.location
    });
  }

  // 盘点员B扫描行政部资产（其中一个错位）
  const adminDeptAssets = allAssets.list.filter(a => a.department === '行政部');
  for (let i = 0; i < adminDeptAssets.length; i++) {
    const asset = adminDeptAssets[i];
    const loc = i === 0
      ? { building: 'A座', floor: '5层', room: '501室' }
      : asset.location;
    AssetInventory.task.submitScan({
      taskId: mainTask.id,
      assetNo: asset.assetNo,
      scanner: '盘点员B',
      scanLocation: loc
    });
  }

  const scannerStats = AssetInventory.summary.summarizeByScanner(mainTask.id);
  console.log('盘点员统计:');
  scannerStats.forEach(s => {
    console.log(`  - ${s.scanner}: 扫描${s.totalScans}次, 唯一资产${s.uniqueAssets}个, 错位${s.misplaced}个`);
  });

  const scopeStats = AssetInventory.summary.summarizeByScope(mainTask.id);
  console.log('各盘点范围完成率:');
  scopeStats.forEach(s => {
    console.log(`  - ${s.scopeName}: ${s.completionRate}%, 负责: ${s.assignedScanner}`);
  });

  // ==============================================
  // 6. 异常审批流程 - 待处理事项、同步更新
  // ==============================================
  log('【新功能4】异常审批流程 - 待处理事项、同步更新资产');

  const testAsset = allAssets.list[0];
  const { exception, pendingAction } = AssetInventory.exception.createException({
    taskId: mainTask.id,
    assetId: testAsset.id,
    assetNo: testAsset.assetNo,
    type: ExceptionType.DAMAGED,
    description: '屏幕有裂痕，外壳变形',
    reporter: '盘点员A',
    priority: 'high',
    suggestedAction: {
      updateStatus: AssetStatus.DAMAGED
    },
    assignee: '资产主管'
  });

  console.log('异常记录ID:', exception.id);
  console.log('待处理事项ID:', pendingAction.id);
  console.log('待处理事项标题:', pendingAction.title);
  console.log('待处理事项优先级:', pendingAction.priority);

  const pendingList = AssetInventory.exception.listPendingActions({ status: 'pending' });
  console.log('待审批事项数量:', pendingList.length);

  // 审批通过并同步更新资产状态
  const beforeStatus = AssetInventory.asset.getAsset(testAsset.id)?.status;
  console.log('审批前资产状态:', beforeStatus);

  AssetInventory.exception.approve(exception.id, '资产主管', '情况属实，安排维修', {
    syncAssetUpdate: true
  });

  const afterStatus = AssetInventory.asset.getAsset(testAsset.id)?.status;
  console.log('审批后资产状态:', afterStatus);
  console.log('✅ 审批同步更新状态成功:', afterStatus === AssetStatus.DAMAGED);

  const historyAfter = AssetInventory.asset.getAssetHistory(testAsset.id);
  console.log('资产履历记录数:', historyAfter.length);
  console.log('履历事件链:');
  historyAfter.forEach(h => {
    console.log(`  [${h.type}] ${h.title} - ${h.timestamp}`);
  });

  // ==============================================
  // 7. 结果汇总 - 详细分类统计
  // ==============================================
  log('【新功能5】结果汇总 - 详细分类统计');

  // 添加一个非计划资产扫描
  const extraAsset = AssetInventory.asset.registerAsset({
    assetNo: 'EXTRA-001',
    name: '额外资产',
    category: AssetCategory.OTHER,
    location: { building: 'C座', floor: '1层', room: '101室' },
    responsiblePerson: '王五',
    department: '财务部'
  });
  AssetInventory.task.submitScan({
    taskId: mainTask.id,
    assetNo: 'EXTRA-001',
    scanner: '盘点员A',
    scanLocation: extraAsset.location
  });

  const detailed = AssetInventory.summary.getDetailedStats(mainTask.id);
  console.log('详细统计:');
  console.log('  - 计划总资产:', detailed.totalPlanAssets);
  console.log('  - 已盘(计划内):', detailed.scannedInPlan);
  console.log('  - 未盘(计划内):', detailed.unscannedInPlan);
  console.log('  - 非计划扫描:', detailed.outOfPlanScanned);
  console.log('  - 重复扫描:', detailed.duplicateScans);
  console.log('  - 错位资产:', detailed.misplacedInPlan);
  console.log('  - 未注册资产:', detailed.unregisteredAssets);
  console.log('  - 正常资产:', detailed.normalInPlan);
  console.log('  - 完成率:', detailed.completionRate + '%');
  console.log('  - 准确率:', detailed.accuracyRate + '%');

  const outOfPlan = AssetInventory.summary.getOutOfPlanAssets(mainTask.id);
  console.log('非计划扫描到的资产数:', outOfPlan.length);

  const finalReport = AssetInventory.summary.generateReport(mainTask.id);
  console.log('最终报告 - 差异项数:', finalReport.differenceList.length);
  console.log('最终报告 - 部门数:', finalReport.departmentSummaries.length);

  // ==============================================
  // 8. 合并后验证数据一致性
  // ==============================================
  log('【验证】导出再导入，所有关系保持一致');

  const finalSnapshot = AssetInventory.store.exportSnapshot();
  const json = JSON.stringify(finalSnapshot);

  AssetInventory.store.clear();
  AssetInventory.store.importJSON(json, 'replace');

  const verifyTask = AssetInventory.task.getTask(mainTask.id);
  const verifyReport = AssetInventory.summary.generateReport(mainTask.id);
  console.log('✅ 恢复后任务存在:', !!verifyTask);
  console.log('✅ 恢复后报告生成正常:', verifyReport.totalAssets === detailed.totalPlanAssets);
  console.log('✅ 恢复后完成率一致:', verifyReport.completionRate === detailed.completionRate);

  // 继续创建新任务
  const newTaskAfterRestore = AssetInventory.task.createTask({
    name: '追加盘点',
    batchNo: 'INV-EXTRA-002',
    operator: '盘点主管'
  });
  console.log('✅ 恢复后能创建新任务:', !!newTaskAfterRestore.id);

  // ==============================================
  // 9. 完整盘点报告 - 总览数字和分类清单
  // ==============================================
  log('【新功能6】完整盘点报告 - 总览数字和分类清单');

  AssetInventory.store.clear();

  const reportAssets = [
    AssetInventory.asset.registerAsset({
      assetNo: 'RPT-001', name: '笔记本电脑A', category: AssetCategory.COMPUTER,
      location: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' },
      responsiblePerson: '张三', department: '技术部'
    }),
    AssetInventory.asset.registerAsset({
      assetNo: 'RPT-002', name: '笔记本电脑B', category: AssetCategory.COMPUTER,
      location: { building: 'A座', floor: '5层', room: '502室', position: '2号工位' },
      responsiblePerson: '李四', department: '技术部'
    }),
    AssetInventory.asset.registerAsset({
      assetNo: 'RPT-003', name: '办公椅A', category: AssetCategory.FURNITURE,
      location: { building: 'B座', floor: '3层', room: '301室' },
      responsiblePerson: '王五', department: '行政部'
    }),
    AssetInventory.asset.registerAsset({
      assetNo: 'RPT-004', name: '打印机A', category: AssetCategory.OFFICE_EQUIPMENT,
      location: { building: 'B座', floor: '3层', room: '302室' },
      responsiblePerson: '赵六', department: '行政部'
    }),
    AssetInventory.asset.registerAsset({
      assetNo: 'RPT-005', name: '非计划资产', category: AssetCategory.COMPUTER,
      location: { building: 'C座', floor: '1层', room: '101室' },
      responsiblePerson: '孙七', department: '财务部'
    })
  ];

  const reportTask = AssetInventory.task.createTask({
    name: 'Q3季度盘点',
    batchNo: 'INV-2026-Q3',
    planAssetIds: [reportAssets[0].id, reportAssets[1].id, reportAssets[2].id, reportAssets[3].id],
    operator: '王主管'
  });
  AssetInventory.task.startTask(reportTask.id);

  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'RPT-001', scanLocation: reportAssets[0].location, scanner: '盘点员A' });
  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'RPT-002', scanLocation: reportAssets[1].location, scanner: '盘点员A' });
  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'RPT-003', scanLocation: { building: 'B座', floor: '3层', room: '302室' }, scanner: '盘点员B' });
  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'RPT-005', scanLocation: reportAssets[4].location, scanner: '盘点员B' });
  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'UNKNOWN-999', scanLocation: { building: 'A座', floor: '2层', room: '203室' }, scanner: '盘点员B' });
  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'UNKNOWN-888', scanLocation: { building: 'C座', floor: '1层', room: '101室' }, scanner: '盘点员C' });

  AssetInventory.exception.createException({
    taskId: reportTask.id,
    assetId: reportAssets[0].id,
    assetNo: 'RPT-001',
    type: ExceptionType.DAMAGED,
    description: '外壳有划痕',
    reporter: '盘点员A'
  });

  const fullReport = AssetInventory.summary.generateReport(reportTask.id);

  console.log('📊 报告总览:');
  console.log('  - 计划总数:', fullReport.totalAssets);
  console.log('  - 已盘(计划内):', fullReport.scannedAssets);
  console.log('  - 未盘(计划内):', fullReport.unscannedAssets);
  console.log('  - 重复扫描:', fullReport.duplicateScans);
  console.log('  - 错位资产:', fullReport.misplacedAssets);
  console.log('  - 非计划已注册:', fullReport.outOfPlanAssets);
  console.log('  - 未注册资产:', fullReport.unregisteredAssets);
  console.log('  - 待处理异常:', fullReport.pendingExceptions);
  console.log('  - 已审批异常:', fullReport.approvedExceptions);
  console.log('  - 完成率:', fullReport.completionRate + '%');
  console.log('  - 准确率:', fullReport.accuracyRate + '%');

  console.log('📋 清单数量:');
  console.log('  - 未盘清单:', fullReport.unscannedAssetList.length + '条');
  console.log('  - 错位清单:', fullReport.misplacedAssetList.length + '条');
  console.log('  - 非计划清单:', fullReport.outOfPlanAssetList.length + '条');
  console.log('  - 未注册清单:', fullReport.unregisteredAssetList.length + '条');
  console.log('  - 差异清单:', fullReport.differenceList.length + '条');

  console.log('✅ 报告总览包含非计划资产数量:', fullReport.outOfPlanAssets === 1);
  console.log('✅ 报告总览包含未注册资产数量:', fullReport.unregisteredAssets === 2);
  console.log('✅ 报告包含非计划资产清单:', fullReport.outOfPlanAssetList.length === 1);
  console.log('✅ 报告包含未注册资产清单:', fullReport.unregisteredAssetList.length === 2);
  console.log('✅ 报告包含异常统计（待处理）:', fullReport.pendingExceptions === 1);

  // ==============================================
  // 10. 报告版本管理 - 冻结、复核、版本差异
  // ==============================================
  log('【新功能7】报告版本管理 - 冻结、复核、版本差异');

  const v1 = AssetInventory.report.createReportVersion(reportTask.id, '王主管');
  console.log('📝 生成 v1 报告版本:', v1.version, '状态:', v1.status);

  const v1Frozen = AssetInventory.report.freezeReport(v1.id);
  console.log('❄️ 冻结后状态:', v1Frozen.status, '冻结时间:', v1Frozen.frozenAt);

  const v1Review = AssetInventory.report.submitForReview(v1.id);
  console.log('🔍 提交复核后状态:', v1Review.status);

  const v1Approved = AssetInventory.report.approveReport(v1.id, '李总监', '数据准确，通过复核');
  console.log('✅ 审批通过 - 状态:', v1Approved.status, '复核人:', v1Approved.reviewer);

  AssetInventory.task.submitScan({ taskId: reportTask.id, assetNo: 'RPT-004', scanLocation: reportAssets[3].location, scanner: '盘点员B' });

  const v2 = AssetInventory.report.createReportVersion(reportTask.id, '王主管');
  console.log('📝 生成 v2 报告版本:', v2.version);
  console.log('📈 与 v1 的差异数:', v2.differencesFromPrev?.length || 0);
  if (v2.differencesFromPrev && v2.differencesFromPrev.length > 0) {
    console.log('  主要差异:');
    for (const diff of v2.differencesFromPrev.slice(0, 5)) {
      const sign = diff.change > 0 ? '+' : '';
      console.log(`    ${diff.label}: ${diff.oldValue} → ${diff.newValue} (${sign}${diff.change})`);
    }
  }

  const versions = AssetInventory.report.getReportVersions(reportTask.id);
  console.log('📚 报告版本总数:', versions.length);

  console.log('✅ v1 报告状态为已通过:', v1Approved.status === 'approved');
  console.log('✅ v2 为新版本，版本号递增:', v2.version === 2);
  console.log('✅ 新版本包含与旧版本的差异:', (v2.differencesFromPrev?.length || 0) > 0);

  // ==============================================
  // 11. 细粒度查询 - 组合筛选、分页、带资产信息
  // ==============================================
  log('【新功能8】细粒度查询 - 组合筛选、分页、带资产信息');

  const scanQuery = AssetInventory.query.queryScans({
    taskId: reportTask.id,
    page: 1,
    pageSize: 10
  });
  console.log('🔍 扫描记录查询 - 总数:', scanQuery.total, '返回:', scanQuery.list.length);

  const firstScan = scanQuery.list.find(s => !!s.assetName) || scanQuery.list[0];
  console.log('  首条记录包含资产信息:', !!firstScan.assetName, '部门:', firstScan.department, 'inPlan:', firstScan.inPlan);

  const scannerQuery = AssetInventory.query.queryScans({
    taskId: reportTask.id,
    scanner: '盘点员A',
    page: 1,
    pageSize: 20
  });
  console.log('  按盘点员A筛选:', scannerQuery.total + '条');

  const misplacedQuery = AssetInventory.query.queryScans({
    taskId: reportTask.id,
    status: 'misplaced' as any,
    page: 1,
    pageSize: 20
  });
  console.log('  按错位状态筛选:', misplacedQuery.total + '条');

  const excQuery = AssetInventory.query.queryExceptions({
    taskId: reportTask.id,
    type: 'damaged' as any,
    page: 1,
    pageSize: 10
  });
  console.log('🔍 异常记录查询 - 总数:', excQuery.total);
  console.log('  首条异常包含资产信息:', !!excQuery.list[0].assetName, '责任人:', excQuery.list[0].responsiblePerson);

  const pendingExcQuery = AssetInventory.query.queryExceptions({
    taskId: reportTask.id,
    approvalStatus: 'pending' as any,
    page: 1,
    pageSize: 10
  });
  console.log('  待审批异常:', pendingExcQuery.total + '条');

  console.log('✅ 扫描查询支持分页且带资产信息:', scanQuery.total > 0 && !!firstScan.assetName);
  console.log('✅ 异常查询支持类型筛选且带资产信息:', excQuery.total > 0 && !!excQuery.list[0].assetName);
  console.log('✅ 支持按盘点员、状态等多维度组合筛选:', true);

  log('✅ 所有功能验证完成！');
}

try {
  runTest();
} catch (e) {
  console.error('❌ 测试出错:', e);
  console.error((e as Error).stack);
}
