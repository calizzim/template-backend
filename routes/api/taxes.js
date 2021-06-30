const express = require('express')
const route = express.Router()
const axios = require('axios').default
const config = require('config')
const path = require('path')
const fs = require('fs')

module.exports = class {
    constructor() {
        this.header = config.get('taxeeHeader')
        this.taxee = axios.create({
            baseURL: "http://taxee.io/api/v2/",
            headers: { Authorization: this.header }
        })
        this.taxes = JSON.parse(fs.readFileSync('files/taxes.json')),
        this.states = JSON.parse(fs.readFileSync('files/states.json'))
    }

    async update() {
        const abbs = JSON.parse(fs.readFileSync('files/states.json')).map(state => state.abbreviation)
        const requests = await Promise.all(abbs.map(state => this.taxee.get('/state/2020/'+state)))
        const stateTaxes = abbs.reduce((a,c,i) => { a[c]=requests[i].data; return a },{})
        const federalTaxes = (await this.taxee.get('/federal/2020')).data
        const taxes = { state: stateTaxes, federal: federalTaxes }
        fs.writeFileSync('files/taxes.json',JSON.stringify(taxes,null,4))
        this.taxes = taxes
    }
    
    calcTaxes(salary, taxes) {
        let brackets = taxes.income_tax_brackets
        if(!brackets) return 0
        if(taxes.deductions.length) salary -= taxes.deductions[0].deduction_amount
        brackets.push({bracket: Infinity})
        return brackets.reduce((tax,bracket,index)=>
        salary>bracket.bracket ?
        tax + (Math.min(salary,brackets[index+1].bracket)-bracket.bracket) * bracket.marginal_rate / 100 : tax, 0)
    }

    getAbbrev(state) {
        return this.states.find(e => e.name == state).abbreviation
    }

    getTaxes(native, computed) {
        let savingsAmount = computed.pretaxSalary * native.savingPercentage / 100
        let grossSalary = computed.pretaxSalary - Math.min(savingsAmount, 19500)
        let state = this.getAbbrev(native.state)
        let federalTaxes = this.taxes.federal[native.filingStatus]
        let stateTaxes = this.taxes.state[state][native.filingStatus]
        return {
            federal: this.calcTaxes(grossSalary, federalTaxes),
            fica: computed.pretaxSalary * 0.0765,
            state: this.calcTaxes(grossSalary, stateTaxes)
        }
    }
}