const jasmine = self.jasmine

jasmine.getEnv().addReporter({
    specStarted: (result) => {
        console.log('CustomReporter.specStarted', result)
        jasmine.currentTest = result
    },
    specDone: (result) => {
        console.log('CustomReporter.specDone', result)
        jasmine.currentTest = result
    },
})
